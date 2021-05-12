/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task', 'N/log'],
    function(render, search, record, email, runtime, task, log){
        function autoApproveStockCounts(context){
          var stockCountSearch = search.load('customsearch_pending_stock_counts');
          var results = stockCountSearch.run().getRange(0, 1000);

          log.debug('Unapproved Stock Count Lines', results.length);
          var limit = 25;
          if (limit > results.length){limit = results.length}

          if (results.length > 0){
            for (var i = 0; i < limit; i++) {
              var lineid = results[i].getValue('internalid');
              var item = results[i].getValue('custrecord_rfs_physicalcount_item');
              var bin = results[i].getText('custrecord_rfs_physicalcount_bin');
              var serialForInventoryAdjustment = 0;
              var serialForBinTransfer = 0;
              var serialGood = 0;
              var serialBad = 0;

              log.debug('Line Check #', i+1);
              log.debug('Stock Count Detail Rec ID', lineid);


              var serialSearch = search.load('customsearch_stock_count_serial');
              var idFilter = {"name":"custrecord_rfs_physicalcount_detail_id","operator":"anyof","values":[lineid],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
              var filters = serialSearch.filters;
              filters.push(idFilter);
              serialSearch.filters = filters;
              var serialResults = serialSearch.run().getRange(0 , 1000);

              log.debug('# of Serials in Good Status', serialResults.length);

              if (serialResults.length > 0) {
                for (var ii = 0; ii < serialResults.length; ii++) {
                  var serialid = serialResults[ii].getValue('internalid');
                  var serial = serialResults[ii].getValue('custrecord_rfs_physicalcount_lotserial');
                  var status = serialResults[ii].getValue('custrecord_rfs_physicalcount_d_invstatus');
                  var info = {
                    InternalID: serialid,
                    Item: item,
                    Serial: serial,
                    Status: status
                  };

                  log.debug('Serial Number Information', info);

                  if (serial != '' && serial != undefined && serial != null){
                    var binSerialSearch = search.load('customsearch379842');
                    var custFilter1 = {"name":"internalid","operator":"anyof","values":[item],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
                    var custFilter2 = {"name":"inventorynumber","join":"inventorynumberbinonhand","operator":"is","values":[serial],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
                    var binSerialFilters = binSerialSearch.filters;
                    binSerialFilters.push(custFilter1, custFilter2);
                    binSerialSearch.filters = binSerialFilters;
                    var binSerialResults = binSerialSearch.run().getRange(0, 1);

                    if(binSerialResults.length > 0){
                      var serialBin = binSerialResults[0].getText({
                        name: "binnumber",
                        join: "inventoryNumberBinOnHand",
                        label: "Bin Number"
                      });

                      var serialLocation = binSerialResults[0].getText({
                        name: "location",
                        join: "inventoryNumberBinOnHand",
                        label: "Location"
                      });

                      if (bin == serialBin){
                        serialGood++;

                        record.submitFields({
                          id: serialid,
                          type: 'customrecord_rfs_physicalcountlotserial',
                          values: {
                            custrecord_auto_approve_log: 'Good'
                          },
                          options: {
                            ignoreMandatoryFields: true,
                            enableSourcing: false
                          }
                        });
                      }
                      else {
                        var locationCheck = search.load('customsearch_bin_lookup');
                        var locFilters = locationCheck.filters;
                        var binFilter = {"name":"binnumber","operator":"contains","values":[bin],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
                        locFilters.push(binFilter);
                        locationCheck.filters = locFilters;
                        var locCheckResults = locationCheck.run().getRange(0, 1);

                        if(locCheckResults.length > 0){
                          var binLocation = locCheckResults[0].getText('location');

                          if (serialLocation === binLocation){
                            serialForBinTransfer++;

                            record.submitFields({
                              id: serialid,
                              type: 'customrecord_rfs_physicalcountlotserial',
                              values: {
                                custrecord_auto_approve_log: 'Bin Transfer',
                                custrecord_location_transfer_from: serialBin,
                                custrecord_location_transfer_to: bin
                              },
                              options: {
                                ignoreMandatoryFields: true,
                                enableSourcing: false
                              }
                            });
                          }
                          else {
                            serialForInventoryAdjustment++;

                            record.submitFields({
                              id: serialid,
                              type: 'customrecord_rfs_physicalcountlotserial',
                              values: {
                                custrecord_auto_approve_log: 'Inventory Transfer',
                                custrecord_location_transfer_from: serialLocation,
                                custrecord_location_transfer_to: binLocation
                              },
                              options: {
                                ignoreMandatoryFields: true,
                                enableSourcing: false
                              }
                            });
                          }
                        }
                      }
                    }
                    else {
                      serialBad++;

                      record.submitFields({
                        id: serialid,
                        type: 'customrecord_rfs_physicalcountlotserial',
                        values: {
                          custrecord_auto_approve_log: 'Ignore'
                        },
                        options: {
                          ignoreMandatoryFields: true,
                          enableSourcing: false
                        }
                      });
                    }
                  }
                }
                var total = serialGood+serialBad+serialForBinTransfer+serialForInventoryAdjustment;
                var serialDetail = {
                  GoodSerials: serialGood,
                  BadSerials: serialBad,
                  SerialForBinTransfer: serialForBinTransfer,
                  SerialForInventoryAdjustment: serialForInventoryAdjustment,
                  Total: total
                };
                log.debug('Serial Verification Count', serialDetail);
              }
              record.submitFields({
                id: lineid,
                type: 'customrecord_rfs_physicalcountdetail', 
                values: {
                  custrecord23: true
                }                 
              });
            }
          }
        }
        return {
            execute: autoApproveStockCounts
        };
    });
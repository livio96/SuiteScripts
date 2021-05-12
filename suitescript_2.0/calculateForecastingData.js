/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/search', 'N/log'],
/*------------------------------------------------------------------------------------------------------------------
Original Scripting on 4/4/2021 | Written by Frank Baert (Changelog will be updated below explanation tree with new additions and calculations)

This script is used to summarize data which will be used for forcasting saved searches in future:
1. Get Value of Item id, preferred stock days, Safety stock days, and lead time (values for Pref Stock days, Safety stock days, and Leadtime will default to 60, 15, and 30 respectively if null)
2. Load search and push item id as filter
3. Get Available Quantity and last 7, 30, 60, 90 days of quantity sold for calculations
4. Calculate following values:
	a. Preferred Daily Movement (Quantity) | Float with 2 decimal places
	b. Preferred Stock Level (Quantity) | INT
	c. Reorder Level (Quantity) | INT
	d. Reorder Level (Days) | INT
	e. Avg Units Sold (7 Days) | Float with 2 decimal places
	f. Avg Units Sold (30 Days) | Float with 2 decimal places
	h. Avg Units Sold (60 Days) | Float with 2 decimal places
	i. Avg Units Sold (90 Days) | Float with 2 decimal places
	j. Rolling Average Units Sold | Float with 2 decimal places
	k. Remaining Supply (Days) | INT
5. Push values of calculations from above point and 7, 30, 60, 90 days sold to respective custom fields on Forcasting Custom Record

Change Log:
	1. 4/5/2021 by Frank Baert
		a. Added additional calculations
			1. Sold 7 Day Avg Delta | float with 2 decimal places 
			2. Sold 7 Day Avg Delta % | float with 2 decimal places to be used as percent
			3. Sold Less 90 Days | INT
*///----------------------------------------------------------------------------------------------------------------
function(record, search, log){
	function calculateForcastingNumbers(con){
		var defaultPrefStockDays = 60;
		var defaultSafetyStockDays = 15;
		var defaultLeadTime = 30;
		var pfRecType = con.newRecord.type;
		var pfRecId = con.newRecord.id;
		var pfRec = record.load({
			type: pfRecType,
			id: pfRecId
		});

//1. Get Value of Item id, preferred stock days, Safety stock days, and lead time and set default values
		var itemid = pfRec.getValue('custrecord_ros_item');
		var prefStockLevelDays = pfRec.getValue('custrecord_ros_pref_stock_days');
		var safetyStockDays = pfRec.getValue('custrecord_ros_safe_stock_days');
		var leadTime = pfRec.getValue('custrecord_ros_lead_time');
		if (prefStockLevelDays == '' || prefStockLevelDays == null || prefStockLevelDays == undefined){prefStockLevelDays = defaultPrefStockDays}
		if (safetyStockDays == '' || safetyStockDays == null || safetyStockDays == undefined){safetyStockDays = defaultSafetyStockDays}
		if (leadTime == '' || leadTime == null || leadTime == undefined){leadTime = defaultLeadTime}

//2. Load search and push item id as filter
		var itemSearch = search.load('customsearch379452'); //Purchase Forcasting Search (DO NOTE CHANGE) link: https://586038.app.netsuite.com/app/common/search/searchresults.nl?searchid=379452&whence=
		var itemFilter = {"name":"internalid","operator":"anyof","values":[itemid],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
		var filters = itemSearch.filters;
		filters.push(itemFilter);
		itemSearch.filters = filters;
		var itemSearchResults = itemSearch.run().getRange(0, 1000);

//3. Get Available Quantity and last 7, 30, 60, 90 days of quantity sold for calculations
		if (itemSearchResults.length > 0){
			var availableQuantity = itemSearchResults[0].getValue('quantityavailable');
			var sold7DayQuantity = itemSearchResults[0].getValue({
				name: "custrecord_quantity_sold_7_days",
				join: "CUSTRECORD_ITEM_NAME",
				label: "Sold Last 7 Days"
			});
			var sold30DayQuantity = itemSearchResults[0].getValue({
				name: "custrecord_quantity_sold_last_30_days",
				join: "CUSTRECORD_ITEM_NAME",
				label: "Sold Last 30 Days"
			});
			var sold60DayQuantity = itemSearchResults[0].getValue({
				name: "custrecord_quantity_sold_last_60_days",
				join: "CUSTRECORD_ITEM_NAME",
				label: "Sold Last 60 Days"
			});
			var sold90DayQuantity = itemSearchResults[0].getValue({
				name: "custrecord_quantity_sold_last_90_days",
				join: "CUSTRECORD_ITEM_NAME",
				label: "Sold Last 90 Days"
			});
			if (availableQuantity == '' || availableQuantity == null || availableQuantity == undefined){availableQuantity = 0}
			if (sold7DayQuantity == '' || sold7DayQuantity == null || sold7DayQuantity == undefined){sold7DayQuantity = 0}
			if (sold30DayQuantity == '' || sold30DayQuantity == null || sold30DayQuantity == undefined){sold30DayQuantity = 0}
			if (sold60DayQuantity == '' || sold60DayQuantity == null || sold60DayQuantity == undefined){sold60DayQuantity = 0}
			if (sold90DayQuantity == '' || sold90DayQuantity == null || sold90DayQuantity == undefined){sold90DayQuantity = 0}
//4. Calculate values and format
			var avgUnitsSold7Days = 0;
			var avgUnitsSold30Days = 0;
			var avgUnitsSold60Days = 0;
			var avgUnitsSold90Days = 0;
			var rollingAvgUnitsSold = 0;
			var prefDailyMovementQuantity = 0;
			var remainingSupplyDays = 0;
			var reorderLevelDays = 0;
			var sold7DayAvgDelta = 0;
			var sold7DayAvgDeltaPercent = 0;
			if (sold7DayQuantity > 0){avgUnitsSold7Days = sold7DayQuantity/7}
			if (sold30DayQuantity > 0){avgUnitsSold30Days = sold30DayQuantity/30}
			if (sold60DayQuantity > 0){avgUnitsSold60Days = sold60DayQuantity/60}
			if (sold90DayQuantity > 0){avgUnitsSold90Days = sold90DayQuantity/90}
			if (avgUnitsSold30Days > 0 || avgUnitsSold60Days > 0 || avgUnitsSold90Days > 0){
				rollingAvgUnitsSold = (avgUnitsSold30Days+avgUnitsSold60Days+avgUnitsSold90Days)/3;
	//Change Log 1. Added calculation for 7 Day Delta and 7 Day Delta % 
				sold7DayAvgDelta = avgUnitsSold7Days - rollingAvgUnitsSold;
				sold7DayAvgDeltaPercent = (sold7DayAvgDelta/rollingAvgUnitsSold);
			}
			if (availableQuantity > 0){
				prefDailyMovementQuantity = availableQuantity/prefStockLevelDays;
				if(rollingAvgUnitsSold == 0){
					remainingSupplyDays = 99999;
					reorderLevelDays = 99999;
				}
				else if (rollingAvgUnitsSold > 0){
					remainingSupplyDays = Math.floor((availableQuantity/rollingAvgUnitsSold));
					reorderLevelDays = Math.floor((availableQuantity/rollingAvgUnitsSold)-(leadTime+safetyStockDays));
				}
			}
			var prefStockLevelQuantity = Math.round((prefStockLevelDays+safetyStockDays)*rollingAvgUnitsSold);
			var reorderLevelQuantity = Math.ceil((leadTime+safetyStockDays)*rollingAvgUnitsSold);
	//Change Log 1. Added calculation for available less 90 days 
			var availablLess90Days = availableQuantity-sold90DayQuantity;
			prefDailyMovementQuantity = prefDailyMovementQuantity.toFixed(2);
			avgUnitsSold7Days = avgUnitsSold7Days.toFixed(2);
			avgUnitsSold30Days = avgUnitsSold30Days.toFixed(2);
			avgUnitsSold60Days = avgUnitsSold60Days.toFixed(2);
			avgUnitsSold90Days = avgUnitsSold90Days.toFixed(2);
			rollingAvgUnitsSold = rollingAvgUnitsSold.toFixed(2);
			sold7DayAvgDelta = sold7DayAvgDelta.toFixed(2);
			sold7DayAvgDeltaPercent = sold7DayAvgDeltaPercent.toFixed(4)*100;
//5. Push values of calculations above to respective custom fields on Forcasting Custom Record
			record.submitFields({
				type: pfRecType,
				id: pfRecId,
				values: {
					custrecord_ros_pref_stock_lvl: prefStockLevelQuantity,
					custrecord_ros_reorder_qty: reorderLevelQuantity,
					custrecord_ros_day_supply: remainingSupplyDays,
					custrecord_ros_rolling_avg: rollingAvgUnitsSold,
					custrecord_ros_reorder_days: reorderLevelDays,
					custrecord_ros_pref_day_movement: prefDailyMovementQuantity,
					custrecord81: avgUnitsSold7Days,
					custrecord_ros_day_avg_30: avgUnitsSold30Days,
					custrecord_ros_day_avg_60: avgUnitsSold60Days,
					custrecord_ros_day_avg_90: avgUnitsSold90Days,
					custrecord_ros_sold_last_7: sold7DayQuantity,
					custrecord_ros_sold_last_30: sold30DayQuantity,
					custrecord_ros_sold_last_60: sold60DayQuantity,
					custrecord_ros_sold_last_90: sold90DayQuantity,
					custrecord82: sold7DayAvgDelta,
					custrecord83: sold7DayAvgDeltaPercent,
					custrecord_ros_avail_less_90: availablLess90Days
				}
			});

		}
	}
	return {
		afterSubmit: calculateForcastingNumbers
	};
});
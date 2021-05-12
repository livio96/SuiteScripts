	/**
	 *@NApiVersion 2.x
	 *@NScriptType ScheduledScript
	 */
	define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file','N/format','N/https','N/sftp'],
	    function(render, search, record, email, runtime, file, format, https, sftp){
			function executeFTPPaypalFileImport(context){
				try {
					var script = runtime.getCurrentScript();
					
					
					GetFilesFromFTP(context);
					
					var remainingUsage = script.getRemainingUsage();
					log.debug({
						title: 'remainingUsage',
						details: remainingUsage
					});
					
					if (remainingUsage < 1000) {
						var mrTask = task.create({
							taskType: task.TaskType.SCHEDULED_SCRIPT,
							scriptId: 'customscript_sch_uploadfilesonftp',
							deploymentId: 'customdeploy1'
						});
						
						var taskObj = mrTask.submit();
						
					}
					
				} 
				catch (err) {
					log.debug('error', '--> ' + err);
				}
			}
			function GetFilesFromFTP(context){
				try {
					//pwd:Shopping2016#
					var CurrentDate = new Date();
					CurrentDate.setDate(CurrentDate.getDate() - 1);//comment for Previous day
					var username = 'sftpmc_paypalathq.com';
					var passwordGuid = 'c937f5d5d8e84177a14e2311fd559db3';
					var url = 'reports.paypal.com';
					var hostKey = 'AAAAB3NzaC1yc2EAAAADAQABAAABAQDHDBjNezkG40FluT09yGTiNH2zzB3PnvfzX0Dj+A1UiV2buDNF0fOlGxu/vMCrnUHnuxjHlJ2ieBRwMl/0NiFd4uL/HtmsyFkT/EbUjZF9Ky2u4TVHHVRuZYnipidCtJ5RABBRwjToeg60C185CJpHGciFTwwGKDrZDZaGbMpKRZB7z0Nt3/Wuk8pO3fvbUGaIC4pAPe2ljyIPp/LuEE4QNlER8Hexs8XHKbo+a22vb0/hrcV38saLFZfm0O62sYkJ8t8bFDN1k/3c+2/0TfMZc6qbWA6sD872zcqaRHM2BtntWn9TuZP36/SclC0k3h1S0M5lQ2Mp5TAKqXtwgCnl';
					var hostKeyType = 'RSA';
					var port = '';
					var directory = '';
					
					var sftpConnection = getSFTPConnection(username, passwordGuid, url, hostKey, hostKeyType, port, directory);
					
					var FileName = '';
					var DownloadFileName = "";
					
					var downloadedFileList = new Array();
					
					downloadedFileList = sftpConnection.list({
						path: '/ppreports/outgoing',
						sort: sftp.Sort.lastModified
					});
					//
					log.debug('downloadedFileList', downloadedFileList);
					
                  	var TodayDt = CurrentDate.getDate();
									var TodayYear = CurrentDate.getFullYear();
									var TodayMonth = (parseInt(CurrentDate.getMonth()) + parseInt(1));
									
                   log.debug('FileName Todays', TodayYear+"-"+TodayMonth+"-"+TodayDt);
                                    
					if (downloadedFileList.length > 0) {
						for (var DirObj in downloadedFileList) {
							var FileObj = downloadedFileList[DirObj];
							
							if (FileObj.directory == false) {
								DownloadFileName = FileObj.name;
								
								if (DownloadFileName.indexOf('STL') > -1) 
                                {
									var FileYear = DownloadFileName.substring(4, 8)
									var FileMonth = DownloadFileName.substring(8, 10)
									var FileDate = DownloadFileName.substring(10, 12)
									
                                   // log.debug('FileName', FileYear+"-"+parseInt(FileMonth)+"-"+parseInt(FileDate));
                                  
                                  //log.debug('FileName', FileYear+"-"+Number(FileMonth)+"-"+Number(FileDate));
                                    
								
									if (Number(FileYear) == Number(TodayYear) && Number(TodayMonth) == Number(FileMonth) && Number(TodayDt) == Number(FileDate)) {
										FileName = DownloadFileName;
										break;
									}
								}
							}
						}
					}
					log.debug('FileName', FileName);
					
					if (FileName != null && FileName != '' && FileName != undefined) {
					
						var UpdatedFileObj = sftpConnection.download({
							directory: '/ppreports/outgoing',
							filename: FileName
						})
						
						var FileDate = FileName.substring(4, 12)
						
						var FileYear = FileName.substring(4, 8)
						var FileMonth = FileName.substring(8, 10)
						var FileDate = FileName.substring(10, 12)
						
						var TodayDt = CurrentDate.getDate();
						var TodayYear = CurrentDate.getFullYear();
						var TodayMonth = (parseInt(CurrentDate.getMonth()) + parseInt(1));
						
						if (Number(FileYear) == Number(TodayYear) && Number(TodayMonth) == Number(FileMonth) && Number(TodayDt) == Number(FileDate)) {
						
							log.debug('FileDate', FileDate);
							
							var arrLines = UpdatedFileObj.getContents().split(/\r\n|\n/);
							
							log.debug('File Downloaded Successfully', arrLines);
							
							var Amount_No = "";
							var Ref_No = "";
							var Check_No = "";
							var TransType_No = "";
							
							for (var j = 1; j < arrLines.length - 1; j++) {
								var FieldcontentData = arrLines[j];
								FieldcontentData = FieldcontentData.replace(/\"/g, '');
								var Fieldcontent = FieldcontentData.split(',');
								
								log.debug('Fieldcontent', '--> ' + Fieldcontent);
								
								log.debug('Fieldcontent', '--> ' + Fieldcontent[0]);
								
								if (Fieldcontent[0] == 'CH') {
									for (var i = 0; i < Fieldcontent.length - 1; i++) {
										var FieldName = Fieldcontent[i];
										
										if (FieldName != null && FieldName != '' && FieldName != undefined) {
											if ('GROSS TRANSACTION AMOUNT' == FieldName.toUpperCase()) {
												Amount_No = i;
											}
											if ('FEE AMOUNT' == FieldName.toUpperCase()) {
												Ref_No = i;
											}
											if ('TRANSACTION ID' == FieldName.toUpperCase()) {
												Check_No = i;
											}
											if ('TRANSACTION DEBIT OR CREDIT' == FieldName.toUpperCase()) {
												TransType_No = i;
											}
											
										}
									}
									break;
								}
							}
							
							var YesterdayDate = new Date();
							YesterdayDate.setDate(YesterdayDate.getDate() - 1);//comment for Previous day
							var StatementDate = format.parse({
								value: YesterdayDate,
								type: format.Type.DATE
							});
							
							var STDate = format.format({
								value: YesterdayDate,
								type: format.Type.DATE
							});
							
							var HeaderSearchRes = search.create({
								type: 'customrecord_nbsabr_bankstatement',
								filters: [["custrecord_bs_reconaccount", "anyOf", 6], "AND", ["custrecord_bs_subsidiary", "anyOf", 1], "AND", ["custrecord_bs_statementdate", "on", STDate]],
								columns: [search.createColumn({
									name: 'internalid',
									label: 'Internal ID'
								})]
							}).run().getRange(0, 1000);
							
							if (HeaderSearchRes != null && HeaderSearchRes != '' && HeaderSearchRes != undefined) {
								var HeaderAccountId = HeaderSearchRes[0].getValue({
									name: 'internalid'
								});
								log.debug('HeaderAccountId', HeaderAccountId);
							}
							else {
								var HeaderbankObj = record.create({
									type: 'customrecord_nbsabr_bankstatement',
									isDynamic: true
								});
								
								
								HeaderbankObj.setValue({
									fieldId: 'custrecord_bs_statementdate',
									value: new Date(StatementDate)
								});
								
								HeaderbankObj.setValue({
									fieldId: 'custrecord_bs_subsidiary',
									value: 1
								});
								
								HeaderbankObj.setValue({
									fieldId: 'custrecord_bs_reconaccount',
									value: 6
								});
								
								HeaderAccountId = HeaderbankObj.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								log.debug('HeaderAccountId', '--> ' + HeaderAccountId);
								
								for (var p = 1; p < arrLines.length - 1; p++) {
									var DatacontentData = arrLines[p];
									DatacontentData = DatacontentData.replace(/\"/g, '');
									var Datacontent = DatacontentData.split(',')
									
									log.debug('Datacontent', '--> ' + Datacontent);
									log.debug('Datacontent 2', '--> ' + Datacontent[0]);
									
									var Amount = 0;
									var Ref = 0;
									var Check = "";
									var TransType = "";
									
									if (Datacontent[0] == 'SB') {
									
										log.debug('content', '--> ' + Datacontent[0]);
										
										// add the columns of the CSV file here
										if (Amount_No != null && Amount_No != '' && Amount_No != undefined) {
											Amount = Datacontent[Amount_No];
											if (Amount) {
											
											}
											log.debug('Amount', Amount);
											
										}
										if (Ref_No != null && Ref_No != '' && Ref_No != undefined) {
											Ref = Datacontent[Ref_No];
											if (Ref != "" && Ref != null && Ref != undefined) {
											
											}
											else {
												Ref = 0;
											}
											
										}
										if (Check_No != null && Check_No != '' && Check_No != undefined) {
											Check = Datacontent[Check_No];
											if (Check) {
											
											}
											
										}
										if (TransType_No != null && TransType_No != '' && TransType_No != undefined) {
											TransType = Datacontent[TransType_No];
											if (TransType) {
											
											}
											
										}
										
										var PaymentType = "";
										if (TransType == 'DR') 
										{
											Amount = ((parseFloat(Amount) / parseFloat(100)) * parseFloat(-1));
											Ref = (parseFloat(Ref) / parseFloat(100));
											
											PaymentType = "refund";
										}
										else {
											PaymentType = "payment";
											Amount = (parseFloat(Amount) / parseFloat(100));
											Ref = ((parseFloat(Ref) / parseFloat(100)) * parseFloat(-1));
											
										}
										
										
										var abrbankObj = record.create({
											type: 'customrecord_nbsabr_bankstatementline',
											isDynamic: true
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_reference',
											value: Ref
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_bankstatementid',
											value: HeaderAccountId
										});
										
										var parsedDateStringAsRawDateObject = format.parse({
											value: STDate,
											type: format.Type.DATE
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_date',
											value: new Date(parsedDateStringAsRawDateObject)
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_autoimport',
											value: true
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_reconaccount',
											value: 6
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_amount',
											value: Amount
										});
										
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_type',
											value: PaymentType
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_checknumber',
											value: Check
										});
										
										var recordId = abrbankObj.save({
											enableSourcing: true,
											ignoreMandatoryFields: true
										});
										log.debug('recordId', '--> ' + recordId);
									}
								}
							}
							
						//log.debug('File Type', FileObj.fileType);
						// loop to get all line
						}
					}
				} 
				catch (err) {
					log.debug('error ftp upload', '--> ' + err);
				}
			}
			
			function getSFTPConnection(username, passwordGuid, url, hostKey, hostKeyType, port, directory){
				var preConnectionObj = {};
				preConnectionObj.passwordGuid = passwordGuid;
				preConnectionObj.url = url;
				preConnectionObj.hostKey = hostKey;
				
				log.debug('username', username);
				log.debug('passwordGuid', passwordGuid);
				log.debug('url', url);
				//log.debug('hostKey', hostKey);
				log.debug('port', port);
				
				if (username) {
					preConnectionObj.username = username;
				}
				if (hostKeyType) {
					preConnectionObj.hostKeyType = hostKeyType;
				}
				if (port) {
					preConnectionObj.port = Number(port);
				}
				if (directory) {
					preConnectionObj.directory = directory;
				}
				var connectionObj = sftp.createConnection(preConnectionObj);
				log.debug('connectionObj', connectionObj);
				return connectionObj;
			}
			function LogValidation(value){
				if (value != null && value != '' && value != undefined) {
					return true;
				}
				else {
					return false;
				}
			}
			return {
				execute: executeFTPPaypalFileImport
			};
		});
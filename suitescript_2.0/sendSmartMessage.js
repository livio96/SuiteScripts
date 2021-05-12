/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

define(['N/record','N/file', 'N/format', 'N/log', 'N/email'],
/*------------------------------------------------------------------------------------------------------------------
Original Scripting on 4/5/2021 | Written by Frank Baert (Changelog will be updated below explanation tree)

This script will be used to send Smart Message using Workflow Action. Steps are as follows:
    1. Get Value for Sender, Send to, Subject, attachment, body, contactid, customer id
    2. Use Values for above fields and map to email. Relate email to Customer and Contact.
    3. Create Record For history Message

*///----------------------------------------------------------------------------------------------------------------
    function(record, file, format, log, email) {
        function SendMessage(con) {
//1. Get Value for Sender, Send to, Subject, attachment, body, contactid, customer id 
            var smRecType = con.newRecord.type;
            var smRecID = con.newRecord.id;
            var smRec = record.load({type: smRecType, id: smRecID});
            var senderId = smRec.getValue('custrecord84');
            var customerId = smRec.getValue('custrecord90');
            //var sendToContactId = smRec.getValue('custrecord91');
            var SendToContactEmail = smRec.getValue('custrecord92');
            var emailSubject = smRec.getValue('custrecord88');
            var emailAttachement = smRec.getValue('custrecord87');
            var emailBody = smRec.getValue('custrecord86');
//2. Use Values for above fields and map to email. Relate email to Customer and Contact.
            email.send({
                author: senderId, 
                recipients: SendToContactEmail,
                subject: emailSubject,
                body: emailBody,
                attachments: emailAttachement,
                relatedRecords: {
                    entityId: customerId,
                    customRecord: {
                        id: smRecID,
                        recordType: 1804
                    }
                }
            });
        }
        return {
            onAction: SendMessage,
        };

    });
function beforeLoad() {
       var createdFrom=nlapiGetFieldValue('createdfrom');

      if(createdFrom!=null || createdFrom !=''){var rate= nlapiGetLineItemField('item','rate');

             rate.setDisplayType('disabled');
}}


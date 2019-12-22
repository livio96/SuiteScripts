function suitelet(request, response){
	
	var html = '<html><body><h1>Hello World</h1></body></html>';

	response.write(html); 
	response.setHeader('custom-header-demo', 'demo');

}

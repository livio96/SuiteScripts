/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/file', 'N/log'], (file, log) => {
    
    const post = (request) => {
        try {
            // Log what we receive
            log.debug('Request received', JSON.stringify(request));
            log.debug('Content length', request.content ? request.content.length : 0);
            
            if (!request.filename || !request.folder || !request.content) {
                throw "Missing required fields: filename, folder, content";
            }
            
            // For PDFs, always use BASE_64
            const encoding = request.fileType === 'PDF' || request.fileType === file.Type.PDF
                ? file.Encoding.BASE_64
                : file.Encoding.UTF8;
            
            log.debug('Using encoding', encoding);
            
            const newFile = file.create({
                name: request.filename,
                fileType: file.Type.PDF,  // Force PDF type
                contents: request.content,
                encoding: encoding
            });
            
            newFile.folder = request.folder;
            const fileId = newFile.save();
            
            return {
                success: true,
                fileId: fileId,
                url: `/core/media/media.nl?id=${fileId}`,
                message: "File uploaded successfully.",
                contentLength: request.content.length
            };
        } catch (error) {
            log.error("Upload Failed", error);
            return { success: false, error: String(error) };
        }
    };
    
    return { post };
});

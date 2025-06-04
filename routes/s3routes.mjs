import { Router } from "express";
import * as s3Controller from "../controllers/s3controller.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();
/*
    To PUT files to s3 first generate the presigned url using a post request to /s3-presigned-url
    with json body contains {"fileName": " ", "fileType"; " "} 
    fileType must be like application/pdf, image/jpeg etc...

    Then extract the presignedUrl from the response data and use it to PUT the file
    to s3. ===>   (SPECIFY THE Content-Type in the headers)
    const response = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
            "Content-Type": fileType
        }
    });

    To check via postman include the contenttype is header and in body upload the file
    via binary
*/
router.post("/s3-presigned-url", controllerWrapper(s3Controller.getPresignedUrl, { logRequest: true, logResponse: true }));


/*
    To GET files from s3 first generate the presigned url using a post request to /s3-presigned-view-url
    with json body contains {"fileName": " "} 

    Then extract the presignedUrl from the response data and use it to GET the file
    from s3.
*/
router.post("/s3-presigned-view-url", controllerWrapper(s3Controller.getPresignedViewUrl, { logRequest: true, logResponse: true }));

export default router;
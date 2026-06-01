import * as functions from 'firebase-functions/v1';
import type { ObjectMetadata } from 'firebase-functions/v1/storage';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v1';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { listUsers as listUsersFunction } from './users';
import { COLLECTIONS, STORAGE_ROOT } from './config';

admin.initializeApp();

const firestore = admin.firestore();
const storage = admin.storage();
const visionClient = new ImageAnnotatorClient();

const docTypeMapping = {
    DOCUMENTO_PACIENTE: { subcollection: 'pacienteDocuments' },
    COMPROVANTE_RESIDENCIA: { subcollection: 'comprovanteResidenciaDocuments' },
    PROCURACAO: { subcollection: 'procuracaoDocuments' },
    RECEITA_MEDICA: { subcollection: 'receitaMedicaDocuments' },
};

// NOTE: Image preprocessing with sharp was removed because the native binary
// fails to compile in Cloud Build. Cloud Vision's documentTextDetection
// handles raw images well without preprocessing.

/**
 * Downloads a file from Firebase Storage and returns its buffer.
 */
async function downloadFromStorage(bucketName: string, filePath: string): Promise<Buffer> {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    const [buffer] = await file.download();
    return buffer;
}

/**
 * Performs OCR on an image with preprocessing and enhanced detection.
 * Uses documentTextDetection which is optimized for dense documents.
 */
async function performOcr(bucketName: string, filePath: string, contentType: string): Promise<string> {
    try {
        // Download the file
        const originalBuffer = await downloadFromStorage(bucketName, filePath);
        logger.info(`Downloaded file: ${filePath} (${originalBuffer.length} bytes)`);

        // For PDFs, use GCS URI; for images, send the raw buffer directly.
        // Cloud Vision's documentTextDetection handles raw images well without preprocessing.
        if (!contentType.startsWith('image/')) {
            const gcsUri = `gs://${bucketName}/${filePath}`;
            const [result] = await visionClient.documentTextDetection(gcsUri);
            const detection = result.fullTextAnnotation;
            return detection?.text || '';
        }

        const [result] = await visionClient.documentTextDetection({
            image: { content: originalBuffer },
        });

        const detection = result.fullTextAnnotation;
        if (detection && detection.text) {
            logger.info(`OCR extracted ${detection.text.length} characters`);
            return detection.text;
        }

        logger.warn('No text detected in document');
        return '';
    } catch (error) {
        logger.error(`Error performing OCR for ${filePath}`, error);
        throw new functions.https.HttpsError('internal', 'Failed to perform OCR.', error);
    }
}


// V1 function syntax
export const anvisaProcessDocumentOnUpload = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 300, memory: '1GB' })
    .storage
    .object()
    .onFinalize(async (object: ObjectMetadata) => {
        const filePath = object.name;
        const bucket = object.bucket;
        const contentType = object.contentType;

        if (!filePath || !contentType) {
            logger.warn('File path or content type missing.');
            return;
        }

        if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
            logger.log(`File content type "${contentType}" is not an image or PDF. Ignoring.`);
            return;
        }

        const pathParts = filePath.split('/');
        if (pathParts.length !== 4 || pathParts[0] !== STORAGE_ROOT) {
            logger.log(`File path "${filePath}" does not match expected structure. Ignoring.`);
            return;
        }

        const [ , requestId, docType, fileName] = pathParts;
        logger.info(`Processing file: ${fileName} for request ${requestId} (type: ${docType})`);

        const docInfo = docTypeMapping[docType as keyof typeof docTypeMapping];
        if (!docInfo) {
            logger.error(`Unknown document type: ${docType}`);
            return;
        }

        try {
            // Perform OCR with preprocessing
            const extractedText = await performOcr(bucket, filePath, contentType);

            // Retry logic: the frontend creates Firestore docs before uploading to
            // Storage, but in edge cases the Cloud Function may fire before the
            // Firestore write is visible. Retry up to 3 times with a short delay.
            let querySnapshot = await firestore.collection(COLLECTIONS.requests).doc(requestId).collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();

            if (querySnapshot.empty) {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    logger.info(`Document not found for "${fileName}", retry ${attempt}/3 after ${attempt * 2}s...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                    querySnapshot = await firestore.collection(COLLECTIONS.requests).doc(requestId).collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();
                    if (!querySnapshot.empty) break;
                }
            }

            if (querySnapshot.empty) {
                logger.error(`Could not find document for file "${fileName}" in request "${requestId}" after retries.`);
                return;
            }

            const docToUpdateRef = querySnapshot.docs[0].ref;

            // Save the raw extracted text
            await docToUpdateRef.update({
                ocrTextChunks: extractedText ? [extractedText] : [],
                ocrStatus: 'completed',
                extractedFields: '{}',
                missingCriticalFields: [],
                fieldConfidence: '{}',
            });

            const requestRef = firestore.collection(COLLECTIONS.requests).doc(requestId);
            const requestSnap = await requestRef.get();
            const currentStatus = requestSnap.data()?.status;

            // Only move to EM_AJUSTE if the request was in PENDENTE (manual flow).
            // If it's already EM_AUTOMACAO (auto flow), keep it so the frontend
            // proceeds with automation without requiring a manual button press.
            const newStatus = currentStatus === 'EM_AUTOMACAO' ? 'EM_AUTOMACAO' : 'EM_AJUSTE';
            await requestRef.update({
                status: newStatus,
                currentStep: 'OCR',
                updatedAt: new Date().toISOString(),
            });

            logger.info(`Successfully processed and updated Firestore for ${fileName}.`);

        } catch (error) {
            logger.error(`Error processing document ${filePath}:`, error);
            // Mark the individual document as errored
            try {
                const querySnapshot = await firestore.collection(COLLECTIONS.requests).doc(requestId)
                    .collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();
                if (!querySnapshot.empty) {
                    await querySnapshot.docs[0].ref.update({ ocrStatus: 'error' });
                }
            } catch (innerError) {
                logger.error('Failed to update ocrStatus to error', innerError);
            }
            const requestRef = firestore.collection(COLLECTIONS.requests).doc(requestId);
            await requestRef.update({ status: 'ERRO', updatedAt: new Date().toISOString() });
        }
    });

export const anvisaListUsers = listUsersFunction;

// ── Scheduled payment checker ─────────────────────────────────────────
export { checkPendingPayments } from './check-payments';

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anvisaListUsers = exports.anvisaProcessDocumentOnUpload = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const v1_1 = require("firebase-functions/v1");
const vision_1 = require("@google-cloud/vision");
const sharp_1 = __importDefault(require("sharp"));
const users_1 = require("./users");
const config_1 = require("./config");
admin.initializeApp();
const firestore = admin.firestore();
const storage = admin.storage();
const visionClient = new vision_1.ImageAnnotatorClient();
const docTypeMapping = {
    DOCUMENTO_PACIENTE: { subcollection: 'pacienteDocuments' },
    COMPROVANTE_RESIDENCIA: { subcollection: 'comprovanteResidenciaDocuments' },
    PROCURACAO: { subcollection: 'procuracaoDocuments' },
    RECEITA_MEDICA: { subcollection: 'receitaMedicaDocuments' },
};
/**
 * Preprocesses an image to improve OCR accuracy.
 * - Auto-rotates based on EXIF data
 * - Converts to grayscale (removes noisy backgrounds)
 * - Normalizes contrast (critical for faded text)
 * - Applies light blur + sharpen (cleans up scan artifacts)
 * - Upscales 1.5x (helps with small text like CRM numbers)
 */
async function preprocessImage(imageBuffer) {
    try {
        const metadata = await (0, sharp_1.default)(imageBuffer).metadata();
        const width = metadata.width || 1000;
        const height = metadata.height || 1000;
        // Calculate upscale dimensions (1.5x, max 4000px to avoid memory issues)
        const scaleFactor = 1.5;
        const newWidth = Math.min(Math.round(width * scaleFactor), 4000);
        const newHeight = Math.min(Math.round(height * scaleFactor), 4000);
        const processed = await (0, sharp_1.default)(imageBuffer)
            // Fix rotation based on EXIF orientation
            .rotate()
            // Convert to grayscale (removes colored backgrounds, stamps)
            .grayscale()
            // Normalize contrast (stretch histogram for better text visibility)
            .normalize()
            // Light blur to reduce noise, then sharpen for crisp edges
            .blur(0.5)
            .sharpen({ sigma: 1.5 })
            // Upscale for better small text recognition
            .resize(newWidth, newHeight, {
            kernel: 'lanczos3',
            withoutEnlargement: false,
        })
            // Output as high-quality JPEG
            .jpeg({ quality: 95 })
            .toBuffer();
        v1_1.logger.info(`Preprocessed image: ${width}x${height} → ${newWidth}x${newHeight}`);
        return processed;
    }
    catch (error) {
        v1_1.logger.warn('Image preprocessing failed, using original image', error);
        return imageBuffer;
    }
}
/**
 * Downloads a file from Firebase Storage and returns its buffer.
 */
async function downloadFromStorage(bucketName, filePath) {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    const [buffer] = await file.download();
    return buffer;
}
/**
 * Performs OCR on an image with preprocessing and enhanced detection.
 * Uses documentTextDetection which is optimized for dense documents.
 */
async function performOcr(bucketName, filePath, contentType) {
    try {
        // Download the file
        const originalBuffer = await downloadFromStorage(bucketName, filePath);
        v1_1.logger.info(`Downloaded file: ${filePath} (${originalBuffer.length} bytes)`);
        let imageBuffer;
        // Only preprocess images, not PDFs (Vision API handles PDFs differently)
        if (contentType.startsWith('image/')) {
            imageBuffer = await preprocessImage(originalBuffer);
        }
        else {
            // For PDFs, use the original file via GCS URI
            const gcsUri = `gs://${bucketName}/${filePath}`;
            const [result] = await visionClient.documentTextDetection(gcsUri);
            const detection = result.fullTextAnnotation;
            return (detection === null || detection === void 0 ? void 0 : detection.text) || '';
        }
        // Use documentTextDetection with preprocessed image buffer
        // This method is optimized for dense text, forms, and structured documents
        const [result] = await visionClient.documentTextDetection({
            image: { content: imageBuffer },
        });
        const detection = result.fullTextAnnotation;
        if (detection && detection.text) {
            v1_1.logger.info(`OCR extracted ${detection.text.length} characters`);
            return detection.text;
        }
        v1_1.logger.warn('No text detected in document');
        return '';
    }
    catch (error) {
        v1_1.logger.error(`Error performing OCR for ${filePath}`, error);
        throw new functions.https.HttpsError('internal', 'Failed to perform OCR.', error);
    }
}
// V1 function syntax
exports.anvisaProcessDocumentOnUpload = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 300, memory: '1GB' })
    .storage
    .object()
    .onFinalize(async (object) => {
    var _a;
    const filePath = object.name;
    const bucket = object.bucket;
    const contentType = object.contentType;
    if (!filePath || !contentType) {
        v1_1.logger.warn('File path or content type missing.');
        return;
    }
    if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
        v1_1.logger.log(`File content type "${contentType}" is not an image or PDF. Ignoring.`);
        return;
    }
    const pathParts = filePath.split('/');
    if (pathParts.length !== 4 || pathParts[0] !== config_1.STORAGE_ROOT) {
        v1_1.logger.log(`File path "${filePath}" does not match expected structure. Ignoring.`);
        return;
    }
    const [, requestId, docType, fileName] = pathParts;
    v1_1.logger.info(`Processing file: ${fileName} for request ${requestId} (type: ${docType})`);
    const docInfo = docTypeMapping[docType];
    if (!docInfo) {
        v1_1.logger.error(`Unknown document type: ${docType}`);
        return;
    }
    try {
        // Perform OCR with preprocessing
        const extractedText = await performOcr(bucket, filePath, contentType);
        // Retry logic: the frontend creates Firestore docs before uploading to
        // Storage, but in edge cases the Cloud Function may fire before the
        // Firestore write is visible. Retry up to 3 times with a short delay.
        let querySnapshot = await firestore.collection(config_1.COLLECTIONS.requests).doc(requestId).collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();
        if (querySnapshot.empty) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                v1_1.logger.info(`Document not found for "${fileName}", retry ${attempt}/3 after ${attempt * 2}s...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                querySnapshot = await firestore.collection(config_1.COLLECTIONS.requests).doc(requestId).collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();
                if (!querySnapshot.empty)
                    break;
            }
        }
        if (querySnapshot.empty) {
            v1_1.logger.error(`Could not find document for file "${fileName}" in request "${requestId}" after retries.`);
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
        const requestRef = firestore.collection(config_1.COLLECTIONS.requests).doc(requestId);
        const requestSnap = await requestRef.get();
        const currentStatus = (_a = requestSnap.data()) === null || _a === void 0 ? void 0 : _a.status;
        // Only move to EM_AJUSTE if the request was in PENDENTE (manual flow).
        // If it's already EM_AUTOMACAO (auto flow), keep it so the frontend
        // proceeds with automation without requiring a manual button press.
        const newStatus = currentStatus === 'EM_AUTOMACAO' ? 'EM_AUTOMACAO' : 'EM_AJUSTE';
        await requestRef.update({
            status: newStatus,
            currentStep: 'OCR',
            updatedAt: new Date().toISOString(),
        });
        v1_1.logger.info(`Successfully processed and updated Firestore for ${fileName}.`);
    }
    catch (error) {
        v1_1.logger.error(`Error processing document ${filePath}:`, error);
        // Mark the individual document as errored
        try {
            const querySnapshot = await firestore.collection(config_1.COLLECTIONS.requests).doc(requestId)
                .collection(docInfo.subcollection).where('fileName', '==', fileName).limit(1).get();
            if (!querySnapshot.empty) {
                await querySnapshot.docs[0].ref.update({ ocrStatus: 'error' });
            }
        }
        catch (innerError) {
            v1_1.logger.error('Failed to update ocrStatus to error', innerError);
        }
        const requestRef = firestore.collection(config_1.COLLECTIONS.requests).doc(requestId);
        await requestRef.update({ status: 'ERRO', updatedAt: new Date().toISOString() });
    }
});
exports.anvisaListUsers = users_1.listUsers;
//# sourceMappingURL=index.js.map
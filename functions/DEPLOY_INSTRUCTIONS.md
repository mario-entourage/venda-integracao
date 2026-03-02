# ANVISA Cloud Function Deployment Guide

## Overview
This directory contains the Cloud Function `anvisaProcessDocumentOnUpload` which:
1. Listens for document uploads to `anvisa_requests/{requestId}/{docType}/{fileName}` in Firebase Storage
2. Runs Google Cloud Vision OCR with image preprocessing (grayscale, sharpen, upscale)
3. Saves extracted text to Firestore subcollection documents
4. Updates the request status in Firestore

## Prerequisites
1. Firebase project configured (already done: `simple-login-fdcf7`)
2. Google Cloud project with billing enabled
3. GCP IAM permissions fixed (see below)

## Current Status
The functions code has been built and is ready to deploy. However, the initial deployment attempt failed due to missing GCP IAM permissions.

## Fix GCP IAM Permissions

### Option 1: Using Google Cloud Console (Recommended)
1. Go to https://console.cloud.google.com
2. Select project: `simple-login-fdcf7`
3. Navigate to **IAM & Admin → IAM**
4. Find the service account: `471797457785-compute@developer.gserviceaccount.com`
   - If not visible, enable "Include Google-provided role grants" toggle
5. Click the service account and add role: **Storage Object Viewer**
   - Or manually search for `roles/storage.objectViewer`
6. Save the changes

### Option 2: Using gcloud CLI
```bash
gcloud projects add-iam-policy-binding simple-login-fdcf7 \
  --member=serviceAccount:471797457785-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectViewer

gcloud projects add-iam-policy-binding simple-login-fdcf7 \
  --member=serviceAccount:471797457785-compute@developer.gserviceaccount.com \
  --role=roles/storage.admin
```

## Deploy Functions (after fixing IAM)

```bash
firebase deploy --only functions
```

Or if you encounter cleanup policy warnings:
```bash
firebase deploy --only functions --force
```

## Function Details

### anvisaProcessDocumentOnUpload
- **Trigger**: Firebase Storage write at `anvisa_requests/{requestId}/{docType}/{fileName}`
- **Region**: us-central1
- **Memory**: 1GB
- **Timeout**: 5 minutes
- **Collections**:
  - Reads from: `anvisa_requests/{requestId}/{docType}/*`
  - Writes to: `anvisa_requests/{requestId}/{docType}/{docId}` (ocrStatus, ocrTextChunks)
  - Writes to: `anvisa_requests/{requestId}` (status, currentStep)

### anvisaListUsers
- **Helper function**: Lists Firebase Auth users (for admin purposes)

## Environment Variables
- `FIRESTORE_PREFIX`: Set to `anvisa_` by default in `src/config.ts`
  - No need to set at deploy time; uses default

## Firestore Collections Used
- `anvisa_requests` - Main request documents
- `anvisa_requests/{id}/pacienteDocuments`
- `anvisa_requests/{id}/comprovanteResidenciaDocuments`
- `anvisa_requests/{id}/procuracaoDocuments`
- `anvisa_requests/{id}/receitaMedicaDocuments`

## Storage Paths
- `anvisa_requests/{requestId}/{docType}/{fileName}`
  - docType: `DOCUMENTO_PACIENTE`, `COMPROVANTE_RESIDENCIA`, `PROCURACAO`, `RECEITA_MEDICA`

## Testing the Deployed Function
After successful deployment, upload a document via the ANVISA module (navigate to `/anvisa/nova`):
1. Upload a document
2. Check Firebase Console → Cloud Functions → Logs for `anvisaProcessDocumentOnUpload`
3. Verify in Firestore that `ocrStatus` is set to `completed`
4. The OCR extraction hook will then automatically proceed with Gemini vision extraction

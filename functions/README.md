# Backend Cloud Function

This directory contains the source code for the backend Cloud Function responsible for OCR processing.

## Deployment Steps

To deploy this function and enable automatic document processing, you must have the [Firebase CLI](https://firebase.google.com/docs/cli#install-cli-mac-linux) installed and be logged into the Google account associated with this project.

Once the Firebase CLI is installed, run the following command from your project's **root directory**:

```sh
firebase deploy --only functions
```

This single command will automatically install the necessary dependencies, compile the TypeScript code, and deploy the function to your Firebase project.

After deployment is complete, the OCR processing will be fully active. You can check the status of your function and see logs in the Firebase Console under the "Functions" section.

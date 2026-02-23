import { config } from 'dotenv';
config();

import './flows/classify-document';
import './flows/extract-ocr-fields';
import './flows/generate-email';

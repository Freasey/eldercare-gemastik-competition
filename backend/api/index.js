/**
 * Handler serverless Vercel.
 *
 * Seluruh trafik diarahkan ke sini oleh `rewrites` di vercel.json, jadi Express
 * tetap yang memegang routing path aslinya sampai utuh ke `req.url`. Tidak
 * ada `listen()`: Vercel yang memanggil handler ini per request.
 */
import { app } from '../src/app.js';

export default app;

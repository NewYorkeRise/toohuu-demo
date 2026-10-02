import './verify-heic-vendor.mjs';
import {mkdir,copyFile,rm,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of ['index.html','admin.html','admin.js','admin.css','admin.image.js','admin.heic-worker.js']) await copyFile(file,`dist/${file}`);
await cp('admin.vendor','dist/admin.vendor',{recursive:true});
console.log('Storefront and admin assets built.');

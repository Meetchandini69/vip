import {defineConfig} from 'vite';
export default defineConfig({
 base:'/blog/',
 build:{outDir:'dist/blog'},
 server:{proxy:{'/api':'http://127.0.0.1:3001'}}
});

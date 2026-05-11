#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function check(bin, args){ const r=spawnSync(bin,args,{encoding:'utf8'}); return {ok:r.status===0, out:(r.stdout||r.stderr||'').trim()}; }
let ok=true;
console.log('Local downloader doctor');
console.log(`✓ Node ${process.version}`);
const y=check(process.env.YTDLP_PATH||'yt-dlp',['--version']);
if(y.ok) console.log(`✓ yt-dlp ${y.out.split('\n')[0]}`); else { ok=false; console.log('✗ yt-dlp not found\nFix:\nmacOS: brew install yt-dlp\nWindows: winget install yt-dlp.yt-dlp\nLinux: python3 -m pip install -U yt-dlp'); }
const f=check('ffmpeg',['-version']); if(f.ok) console.log('✓ ffmpeg found'); else {ok=false; console.log('✗ ffmpeg not found\nFix:\nmacOS: brew install ffmpeg\nWindows: winget install Gyan.FFmpeg\nLinux: sudo apt install ffmpeg');}
const p=check('ffprobe',['-version']); if(p.ok) console.log('✓ ffprobe found'); else {ok=false; console.log('✗ ffprobe not found');}
try{ const d=await fs.mkdtemp(path.join(tmpdir(),'ponotai-doc-')); await fs.rm(d,{recursive:true,force:true}); console.log('✓ temp writable'); }catch{ ok=false; console.log('✗ temp not writable'); }
try{ const c=process.env.YTDLP_CACHE_DIR||path.join(tmpdir(),'ponotai-ytdlp-cache'); await fs.mkdir(c,{recursive:true}); const t=path.join(c,'.doctor'); await fs.writeFile(t,'ok'); await fs.rm(t,{force:true}); console.log('✓ cache writable'); }catch{ ok=false; console.log('✗ cache not writable'); }
process.exit(ok?0:1);

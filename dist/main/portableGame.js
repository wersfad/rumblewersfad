import fs from 'node:fs';
import path from 'node:path';
import { getSettings, setSettings } from './store.js';
import { brandingReport } from './brandingReport.js';
const NAMES=['RumbleverseClient.exe','Rumbleverse.exe','RumbleverseClient-Win64-Shipping.exe','RumbleverseClient-Win32-Shipping.exe'];
export function findBundledExecutable(root) {
  for(const dir of ['', 'Rumbleverse/Binaries/Win64','Rumbleverse/Binaries/Win32','Binaries/Win64','Binaries/Win32'])
    for(const name of NAMES){const relative=path.join(dir,name);try{if(fs.statSync(path.join(root,relative)).isFile())return relative;}catch{}}
  return null;
}
export function configureBundledGame(base=path.dirname(process.execPath)) {
  const gameRoot=path.join(base,'Game');let executable=null;
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(base,'resources','portable-game.json'),'utf8'));
    const rel=manifest.executable;
    if(typeof rel==='string'&&!path.isAbsolute(rel)&&!rel.split(/[\\/]/).includes('..')) {
      const candidate=path.join(gameRoot,rel);
      if(fs.statSync(candidate).isFile()&&NAMES.includes(path.basename(candidate)))executable=rel;
    }
  }catch{}
  executable=executable||findBundledExecutable(gameRoot);
  if(!executable){brandingReport('Bundled Game folder missing; manual game folder remains available.');return false;}
  const settings=getSettings();
  if(settings.gameFolder!==gameRoot||settings.gameExecutable!==executable)setSettings({gameFolder:gameRoot,gameExecutable:executable});
  brandingReport('Bundled Game selected automatically: '+executable);
  return true;
}

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
export function writeLaunchAudit(requestedName,args) {
 try {
  const value=key=>args.find(a=>a.toLowerCase().startsWith(key.toLowerCase()+'='))?.slice(key.length+1);
  const expected=String(requestedName??'').trim();const plain=value('-RVGuestName'),base64=value('-RVGuestName64');
  const info={version:'1.2.0',time:new Date().toISOString(),requestedName:expected,
    sentName:plain,utf8Base64Matches:!!base64&&Buffer.from(base64,'base64').toString('utf8')===expected,
    plainMatches:plain===expected,verification:'launch-parameters-only',peerVisibilityConfirmed:false,
    explanation:'Параметры запуска не доказывают принятие ника сервером. Подтверждение — отображение на втором клиенте.'};
  fs.mkdirSync(app.getPath('userData'),{recursive:true});
  fs.writeFileSync(path.join(app.getPath('userData'),'nickname-check.json'),JSON.stringify(info,null,2),'utf8');
 }catch{}
}

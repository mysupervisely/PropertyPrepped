import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { it } from 'vitest';
import { transformWithOxc } from 'vite';
it('releases saving state and preserves drafts on read/save failures', async () => {
const source=await readFile(new URL('../../components/property-profile/PropertyTaxPanel.tsx', import.meta.url),'utf8');
await transformWithOxc(source,'PropertyTaxPanel.tsx');
const fn=source.slice(source.indexOf('  async function saveCustomItem() {'),source.indexOf('\n  async function removeCustomItem'));
const code=(await transformWithOxc(fn,'save.ts')).code;
for(const failAt of ['read','record','success']) {
 const events=[];let writes=0;
 const context={customItemDraft:{description:'Repair',amount:'12',documentId:'',notes:'',group:'other'},ownerId:'owner',propertyId:'property',year:'2026',existingRecord:null,customItemFormOpenId:'new',customItemReceiptFile:{},customItemReceiptBytesPromise:Promise.resolve(),
 setCustomItemSaving:v=>events.push(['busy',v]),setCustomItemError:v=>events.push(['error',v]),setCustomItemFormOpenId:v=>events.push(['closed',v]),onRefresh:()=>events.push(['refresh']),
 toDurableUploadableFile:async()=>{if(failAt==='read')throw Error('read failed');return {file:{}}},uploadReceiptDocument:async()=>({ok:true,documentId:'doc'}),toSafeErrorMessage:()=> 'safe error',
 supabase:{from:()=>({insert:async()=>{writes++;if(failAt==='record')throw Error('save response lost');return {error:null}}})}};
 await vm.runInNewContext(code+'\nsaveCustomItem()',context);
 assert.deepEqual(events.at(-1),['busy',false]);
 assert.equal(writes,failAt==='read'?0:1);
 if(failAt!=='success'){assert(!events.some(e=>e[0]==='closed'));assert(events.some(e=>e[0]==='error'&&e[1].includes('Check existing items')))}
 else assert(events.some(e=>e[0]==='closed'));
}
});

import {installWorkspaceUI} from './workspace-ui.mjs';
import {installPreviewZoom} from './preview-zoom.mjs';
import {findTaskLine,patchTask} from './source-edit.mjs';
const $=id=>document.getElementById(id);
const editor=$('source'),frame=$('engine'),notice=$('notice');
let selectedTask=null,visualUndo=null;
let ready=false,busy=false,revision=0,pending=false,timer,timeout,last=null,lastURL=null,sample='',exporting=false;
const fields=['mode','width','aspect','font','row','release','dates','today','note-label','note'];
function message(text,error=false){notice.textContent=text;notice.className=error?'error':'success';}
function updateLines(){const count=editor.value.split('\n').length;$('lines').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');$('line-count').textContent=`${count} 行`;}
function exportState(){for(const id of ['svg','png'])$(id).disabled=exporting||!last||last.revision!==revision;}
function changed(immediate=false){$('task-overlay').replaceChildren();revision++;pending=true;exportState();updateLines();message('内容已修改，等待预览…');clearTimeout(timer);timer=setTimeout(render,immediate?0:500);}
function numeric(id,min,max){const value=Number($(id).value);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${$(id).parentElement.firstChild.textContent.trim()}需在 ${min}–${max} 之间。`);return value;}
function options(){const fontSize=numeric('font',10,48),rowHeight=numeric('row',14,100);if(rowHeight<fontSize+4)throw new Error(`行高至少为 ${fontSize+4}px，请增加行高或减小字号。`);return {mode:$('mode').value,width:Math.round(numeric('width',720,7680)),aspect:$('aspect').value||undefined,fontSize,rowHeight,dates:$('dates').checked?'on':'off',today:$('today').checked?undefined:'off',release:$('release').value||undefined,note:$('note').value.trim(),noteLabel:$('note-label').value||'备注',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,fontFamily:'PingFang SC,Microsoft YaHei,Noto Sans CJK SC,Arial,sans-serif'};}
function prepareSource(source){let s=source.replace(/^\uFEFF/,'').trim();const match=/^```(?:mermaid)?\s*\n([\s\S]*?)\n```\s*$/.exec(s);return match?match[1]:s;}
function render(){
 if(!ready||busy||!pending)return;
 pending=false;let opts;
 try{opts=options();if(!editor.value.trim())throw new Error('请输入 Mermaid 源码。');if(editor.value.length>200000)throw new Error('源码超过 200,000 字符，请分成较小的图表。');}
 catch(error){message(error.message+(last?'\n当前保留上一次成功的预览。':''),true);return;}
 busy=true;frame.style.width=opts.width+'px';message('正在生成预览…');
 frame.contentWindow.postMessage({type:'render',id:revision,source:prepareSource(editor.value),options:opts},location.origin);
 timeout=setTimeout(()=>{busy=false;ready=false;pending=false;message('预览耗时过长，请精简图表后重试。当前保留上一次成功的预览。',true);frame.src='renderer.html?restart='+Date.now();},30000);
}
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const data=event.data;if(data?.type==='ready'){ready=true;render();return;}
 if(data?.type!=='rendered')return;
 clearTimeout(timeout);busy=false;
 if(data.id!==revision){render();return;}
 if(data.error){message(data.error+(last?'\n当前保留上一次成功的预览；修正后自动更新。':''),true);exportState();return;}
 last={...data.result,revision};const url=URL.createObjectURL(new Blob([last.svg],{type:'image/svg+xml;charset=utf-8'}));
 const previous=lastURL;lastURL=url;$('preview').src=url;$('preview').hidden=false;$('empty').hidden=true;
 if(previous)URL.revokeObjectURL(previous);
 $('size').textContent=`${last.width} × ${last.height}`;
 $('summary').textContent=last.kind==='gantt'?`${last.taskCount} 个任务 · ${last.laneCount?last.laneCount+' 个泳道':'官方布局'}`:`${last.kind} · 官方渲染`;
 message(['预览已更新'+(last.kind==='gantt'?' · 点击任务条或名称即可修改':''),...last.warnings].join('\n'));fit();exportState();drawTaskHits();
});
frame.addEventListener('load',()=>frame.contentWindow.postMessage({type:'ping'},location.origin));
frame.contentWindow.postMessage({type:'ping'},location.origin);
function fit(){if(!last)return;const zoom=$('zoom').value;$('paper').style.width=zoom==='fit'?'100%':Math.round(last.width*Number(zoom))+'px';}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function fileName(){const match=/^\s*title\s+(.+)$/m.exec(editor.value);return (match?.[1]||'mermaid-chart').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);}
editor.addEventListener('input',()=>changed());editor.addEventListener('scroll',()=>{$('lines').scrollTop=editor.scrollTop;});
editor.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');changed();}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();changed(true);}});
for(const id of fields)$(id).addEventListener('input',()=>{if(id==='font'&&Number($('row').value)<Number($('font').value)+4)$('row').value=Number($('font').value)+4;changed();});
$('zoom').addEventListener('change',fit);$('refresh').addEventListener('click',()=>changed(true));
$('save-source').addEventListener('click',()=>download(new Blob([editor.value],{type:'text/plain;charset=utf-8'}),fileName()+'.mmd'));
$('svg').addEventListener('click',()=>{if(last?.revision===revision)download(new Blob([last.svg],{type:'image/svg+xml;charset=utf-8'}),fileName()+'.svg');});
$('png').addEventListener('click',async()=>{
 if(!last||last.revision!==revision||exporting)return;
 const snapshot=last,scale=Number($('scale').value),name=fileName();exporting=true;exportState();$('png').textContent='正在导出…';
 let url;
 try{
  const width=Math.round(snapshot.width*scale),height=Math.round(snapshot.height*scale);
  if(width*height>32000000||width>16384||height>16384)throw new Error('PNG 尺寸过大，请降低像素倍率或画布尺寸。');
  await document.fonts.ready;const image=new Image();url=URL.createObjectURL(new Blob([snapshot.svg],{type:'image/svg+xml;charset=utf-8'}));image.src=url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 生成失败，请尝试 SVG 导出。')),'image/png');}catch(error){reject(error);}});
  download(blob,name+'.png');message(`PNG 已导出 · ${width} × ${height}`);
 }catch(error){message('导出失败：'+error.message+'\n含 HTML 或外部图片的图表可先导出 SVG。',true);}
 finally{if(url)URL.revokeObjectURL(url);exporting=false;$('png').textContent='导出 PNG';exportState();}
});
$('file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>800000)throw new Error('文件过大，请使用小于 800 KB 的 Mermaid 文件。');editor.value=await file.text();$('release').value='';$('note').value='';changed(true);}catch(error){message(error.message,true);}finally{event.target.value='';}});
$('sample').addEventListener('click',()=>{if(!sample)return;if(editor.value.trim()&&editor.value!==sample&&!confirm('载入示例会替换当前源码。是否继续？'))return;editor.value=sample;$('release').value='2026-10-15';$('note').value='确认负责人及跨团队依赖';changed(true);});
try{const response=await fetch('example.mmd');if(!response.ok)throw new Error('示例加载失败');sample=await response.text();if(!editor.value)editor.value=sample;changed(true);}catch(error){message(error.message+'，可以直接粘贴源码开始编辑。',true);}
// Optional browser agent interface; unsupported browsers keep the same visible editor.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_mermaid_editor',description:'读取当前 Mermaid 源码及预览状态。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({source:editor.value,previewCurrent:last?.revision===revision,error:notice.classList.contains('error')?notice.textContent:null})});
 register({name:'edit_mermaid_source',description:'替换编辑器中的 Mermaid 源码并生成预览。',inputSchema:{type:'object',properties:{source:{type:'string'}},required:['source'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input.source!=='string'||!input.source.trim()||input.source.length>200000)throw new Error('需要非空 Mermaid 源码，最多 200,000 字符。');editor.value=input.source;changed(true);const target=revision;await new Promise((resolve,reject)=>{const start=Date.now();const poll=setInterval(()=>{if(revision!==target){clearInterval(poll);reject(new Error('源码已再次修改'));}else if(last?.revision===target){clearInterval(poll);resolve();}else if((!busy&&!pending&&notice.classList.contains('error'))||Date.now()-start>32000){clearInterval(poll);reject(new Error(notice.textContent));}},100);});return {updated:true,width:last.width,height:last.height};}});
}

function drawTaskHits(){
 const overlay=$('task-overlay');overlay.replaceChildren();
 for(const task of last.taskHits??[]){
  if(!findTaskLine(editor.value,task))continue;
  const button=document.createElement('button');button.type='button';button.className='task-hit';button.title='编辑：'+task.label;button.setAttribute('aria-label','编辑任务：'+task.label);
  Object.assign(button.style,{left:task.x+'%',top:task.y+'%',width:task.w+'%',height:task.h+'%'});
  button.addEventListener('click',()=>openTask(task));overlay.append(button);
 }
}
function openTask(task){
 if(last?.revision!==revision)return;
 const line=findTaskLine(editor.value,task);if(!line){message('无法唯一定位任务，请在源码中为它设置唯一 ID。',true);return;}
 selectedTask={task,line,revision};$('task-id').textContent='任务 ID：'+line.id+' · 泳道：'+task.section;$('task-name').value=line.label;
 const tokens=line.schedule.split(',');$('task-start').value=tokens.shift()?.trim()??'';$('task-end').value=tokens.join(',').trim();
 for(const flag of ['done','active','crit','milestone'])$('task-'+flag).checked=line.flags.includes(flag);
 $('task-error').textContent='';$('task-dialog').showModal();
}
for(const id of ['task-close','task-cancel'])$(id).addEventListener('click',()=>$('task-dialog').close());
$('task-form').addEventListener('submit',event=>{
 event.preventDefault();if(!selectedTask)return;
 try{
  if(selectedTask.revision!==revision)throw new Error('源码已变化，请关闭面板并重新选择任务。');
  const previous=editor.value,edit={label:$('task-name').value,schedule:[$('task-start').value.trim(),$('task-end').value.trim()].filter(Boolean).join(', ')};
  for(const flag of ['done','active','crit','milestone'])edit[flag]=$('task-'+flag).checked;
  const next=patchTask(previous,selectedTask.task,selectedTask.line.original,edit);
  visualUndo={before:previous,after:next};editor.value=next;$('undo-visual').disabled=false;$('task-dialog').close();changed(true);
 }catch(error){$('task-error').textContent=error.message;}
});
$('undo-visual').addEventListener('click',()=>{
 if(!visualUndo)return;
 if(editor.value!==visualUndo.after){message('图上修改后源码又发生了变化，无法直接撤销；请在源码中调整。',true);return;}
 editor.value=visualUndo.before;visualUndo=null;$('undo-visual').disabled=true;changed(true);
});

installPreviewZoom({viewport:$('viewport'),paper:$('paper'),select:$('zoom'),wheelToggle:$('wheel-zoom'),getWidth:()=>last?.width});

installWorkspaceUI();

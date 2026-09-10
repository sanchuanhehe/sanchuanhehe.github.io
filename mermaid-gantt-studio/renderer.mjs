import {browserRender} from './browser-render.mjs';
let busy=false;
window.addEventListener('message',async event=>{
 if(event.source!==parent||event.origin!==location.origin)return;
 if(event.data?.type==='ping'){parent.postMessage({type:'ready'},location.origin);return;}
 if(event.data?.type!=='render'||busy)return;
 const {id,source,options}=event.data;busy=true;
 try{
  let result;
  // Gantt keeps the exact version-pinned adapter used by the CLI.
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true});
  const kind=mermaid.detectType(source);
  if(kind==='gantt')result=await browserRender({source,options});
  else{
   mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,htmlLabels:false,flowchart:{htmlLabels:false},fontFamily:options.fontFamily});
   const rendered=await mermaid.render('native_chart',source);
   const mount=document.getElementById('mount');mount.innerHTML=rendered.svg;await document.fonts.ready;
   const svg=mount.querySelector('svg'),vb=svg.viewBox.baseVal;
   const height=options.aspect?Math.round(options.width*Number(options.aspect.split(':')[1])/Number(options.aspect.split(':')[0])):Math.ceil(options.width*(vb.height||600)/(vb.width||800));
   svg.setAttribute('width',options.width);svg.setAttribute('height',height);svg.style.maxWidth='none';svg.style.background='white';
   result={svg:new XMLSerializer().serializeToString(svg),width:options.width,height,tasks:[],laneCount:0,warnings:options.mode==='styled'?['当前为非甘特图，已使用官方 Mermaid 样式预览。']:[]};
  }
  const {svg,width,height,warnings,tasks,laneCount}=result;
  const canvas=document.querySelector('#mount > svg'),outer=canvas.getBoundingClientRect();
  const taskHits=kind==='gantt'?tasks.filter(t=>!t.vert&&tasks.filter(other=>other.id===t.id).length===1).flatMap(task=>{
   const rect=document.getElementById('gantt_chart-'+task.id),label=document.getElementById('gantt_chart-'+task.id+'-text');if(!rect||!label)return [];
   const boxes=[rect.getBoundingClientRect(),label.getBoundingClientRect()];
   const left=Math.min(...boxes.map(b=>b.left))-outer.left,top=Math.min(...boxes.map(b=>b.top))-outer.top;
   const right=Math.max(...boxes.map(b=>b.right))-outer.left,bottom=Math.max(...boxes.map(b=>b.bottom))-outer.top;
   return [{...task,x:100*left/outer.width,y:100*top/outer.height,w:100*(right-left)/outer.width,h:100*(bottom-top)/outer.height}];
  }):[];
  parent.postMessage({type:'rendered',id,result:{svg,width,height,warnings,taskCount:tasks.length,laneCount,kind,taskHits}},location.origin);
 }catch(error){document.getElementById('mount').replaceChildren();parent.postMessage({type:'rendered',id,error:String(error.message||error)},location.origin);}
 finally{busy=false;}
});
parent.postMessage({type:'ready'},location.origin);

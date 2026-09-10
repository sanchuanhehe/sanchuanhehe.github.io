export function installPreviewZoom({viewport,paper,select,wheelToggle,getWidth}){
 let gesture=null;
 const clamp=n=>Math.max(.05,Math.min(4,n));
 function current(){return paper.getBoundingClientRect().width/(getWidth()||1);}
 function zoomTo(scale,x,y){
  const width=getWidth();if(!width)return;
  const before=paper.getBoundingClientRect(),view=viewport.getBoundingClientRect();
  x??=view.left+viewport.clientWidth/2;y??=view.top+viewport.clientHeight/2;
  const u=(x-before.left)/before.width,v=(y-before.top)/before.height;
  scale=clamp(scale);paper.style.width=Math.round(width*scale)+'px';
  const after=paper.getBoundingClientRect();
  viewport.scrollLeft+=after.left+u*after.width-x;
  viewport.scrollTop+=after.top+v*after.height-y;
  let option=select.querySelector('[data-custom-zoom]');
  if(!option){option=document.createElement('option');option.dataset.customZoom='true';select.append(option);}
  option.value=String(scale);option.textContent=Math.round(scale*100)+'%';select.value=option.value;
 }
 viewport.addEventListener('wheel',event=>{
  if(!getWidth()||gesture||!(event.ctrlKey||event.metaKey||wheelToggle.checked))return;
  event.preventDefault();
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
  zoomTo(current()*Math.exp(-Math.max(-200,Math.min(200,delta))*.005),event.clientX,event.clientY);
 },{passive:false});
 // WebKit trackpads use gesture events; Chromium pinch emits ctrl+wheel.
 viewport.addEventListener('gesturestart',event=>{if(!getWidth())return;event.preventDefault();gesture={scale:current()};},{passive:false});
 viewport.addEventListener('gesturechange',event=>{if(!gesture)return;event.preventDefault();zoomTo(gesture.scale*event.scale,event.clientX,event.clientY);},{passive:false});
 viewport.addEventListener('gestureend',event=>{if(!gesture)return;event.preventDefault();gesture=null;},{passive:false});
 return {zoomTo,current};
}

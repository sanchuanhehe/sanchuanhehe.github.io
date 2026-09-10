export function installWorkspaceUI(){
 const $=id=>document.getElementById(id);
 $('open-settings').addEventListener('click',()=>$('settings-dialog').showModal());
 for(const id of ['close-settings','settings-done'])$(id).addEventListener('click',()=>$('settings-dialog').close());
 for(const button of document.querySelectorAll('.view-switch [data-view]'))button.addEventListener('click',()=>{
  document.body.dataset.view=button.dataset.view;
  for(const item of document.querySelectorAll('.view-switch [data-view]'))item.setAttribute('aria-pressed',String(item===button));
 });
 for(const [id,factor]of [['zoom-in',1.2],['zoom-out',1/1.2]])$(id).addEventListener('click',()=>{
  const image=$('preview');if(image.hidden)return;
  const viewport=$('viewport'),rect=viewport.getBoundingClientRect();
  viewport.dispatchEvent(new WheelEvent('wheel',{deltaY:-Math.log(factor)/.005,ctrlKey:true,clientX:rect.left+viewport.clientWidth/2,clientY:rect.top+viewport.clientHeight/2,bubbles:true,cancelable:true}));
 });
}

/** Runs inside Chromium. Scheduling and native SVG are produced only by Mermaid. */
export async function browserRender({source,options}) {
  const M=window.mermaid, warnings=[];
  const ns='http://www.w3.org/2000/svg';
  const make=(name,attrs={},value)=>{const el=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(value!==undefined)el.textContent=value;return el;};
  const w=options.width-48,font=options.fontSize,barH=Math.max(12,font*.72),gap=options.rowHeight-barH;
  const theme={background:'#FFFFFF',fontFamily:options.fontFamily,primaryTextColor:'#17324D',textColor:'#17324D',titleColor:'#17324D',gridColor:'#E1E7EF',sectionBkgColor:'#F3F6FA',sectionBkgColor2:'#FFFFFF',taskBkgColor:'#DBEAFE',taskBorderColor:'#3B82F6',taskTextColor:'#17324D',taskTextDarkColor:'#17324D',doneTaskBkgColor:'#E2E8F0',doneTaskBorderColor:'#94A3B8',doneTaskTextColor:'#64748B',critBkgColor:'#FEE2E2',critBorderColor:'#DC2626',critTextColor:'#A82C2C',activeTaskBkgColor:'#BFDBFE',activeTaskBorderColor:'#2563EB',todayLineColor:'#D99B28',excludeBkgColor:'#FEF3C7'};
  let cfg={...(options.config??{}),startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,deterministicIds:true,deterministicIDSeed:'gantt-styled-v2',fontFamily:options.fontFamily,
    ...(options.mode==='styled'?{theme:'base',themeVariables:{...theme,...options.config?.themeVariables}}:{}),
    gantt:{...(options.config?.gantt??{}),useWidth:w,useMaxWidth:false,fontSize:font,sectionFontSize:font+2,barHeight:barH,barGap:gap,topPadding:80,...(options.mode==='styled'?{topAxis:true}:{}),leftPadding:options.dates==='off'?160:290,rightPadding:240,titleTopMargin:32}};
  const init=()=>M.initialize(cfg);
  const draw=async()=>{
    init();
    const result=await M.render('gantt_chart',source);
    if(result.diagramType!=='gantt')throw new Error(`本程序用于 gantt；官方引擎识别为 ${result.diagramType}`);
    document.querySelector('#mount').innerHTML=result.svg;
    await document.fonts.ready;
    return {svg:document.querySelector('#mount svg'),raw:result.svg,config:M.mermaidAPI.getConfig()};
  };
  let rendered=await draw();
  // Official DB adapter is version-pinned and checked; it never recalculates schedule dates.
  const diagram=await M.mermaidAPI.getDiagramFromText(source);
  if(typeof diagram.db.getTasks!=='function')throw new Error('官方任务数据接口发生变化，请运行兼容性测试并更新适配器');
  const rawTasks=diagram.db.getTasks();
  const compact=diagram.db.getDisplayMode()==='compact'||rendered.config.gantt.displayMode==='compact';
  const tasks=rawTasks.map(t=>({id:String(t.id),label:t.task,section:t.section,order:t.order,start:Number(t.startTime),end:Number(t.endTime),renderEnd:t.renderEndTime?Number(t.renderEndTime):null,done:!!t.done,active:!!t.active,crit:!!t.crit,milestone:!!t.milestone,vert:!!t.vert}));
  for(const t of tasks)if(!Number.isFinite(t.start)||!Number.isFinite(t.end))throw new Error(`Mermaid 返回了无效排期：${t.label}`);
  if(!tasks.length)throw new Error('甘特图中没有任务');
  const nodePair=(svg,t)=>({rect:svg.querySelector(`#${CSS.escape('gantt_chart-'+t.id)}`),text:svg.querySelector(`#${CSS.escape('gantt_chart-'+t.id+'-text')}`)});
  const duplicates=tasks.filter((t,i)=>tasks.findIndex(x=>x.id===t.id)!==i);
  const canMap=duplicates.length===0&&tasks.every(t=>{const p=nodePair(rendered.svg,t);return p.rect&&p.text;});
  if(!canMap)warnings.push('原生任务节点无法一一映射（可能存在重复 id），保留官方标签布局，不强制右置或添加日期。');
  if(compact)warnings.push('compact 布局保留官方标签位置，避免同一行的任务被右侧标签遮挡。');
  if(options.mode==='styled'&&canMap&&!compact){
    const gc=rendered.config.gantt,left=Number(gc.leftPadding),nativeW=rendered.svg.viewBox.baseVal.width;
    const originalSpan=nativeW-left-Number(gc.rightPadding);
    let wantedSpan=nativeW-left-24;
    for(const t of tasks.filter(t=>!t.vert)){
      const {rect,text}=nodePair(rendered.svg,t),b=rect.getBBox();
      const ratio=(b.x+b.width-left)/originalSpan;
      if(ratio>0)wantedSpan=Math.min(wantedSpan,(nativeW-left-16-text.getBBox().width)/ratio);
    }
    if(wantedSpan>nativeW*.3){
      cfg={...cfg,gantt:{...cfg.gantt,rightPadding:Math.ceil(Math.max(24,nativeW-left-wantedSpan))}};
      rendered=await draw();
    }else warnings.push('长标签需要较多空间；保留原生时间轴宽度，输出会按内容范围适配。');
  }
  const svg=rendered.svg,nativeRaw=rendered.raw,gc=rendered.config.gantt;
  const geometry=()=>[...svg.querySelectorAll('rect.task')].map(el=>({id:el.id,x:el.getAttribute('x'),y:el.getAttribute('y'),width:el.getAttribute('width'),height:el.getAttribute('height'),'transform-origin':el.getAttribute('transform-origin'),class:el.getAttribute('class')}));
  const before=geometry();
  const nativeViewBox=svg.getAttribute('viewBox');
  const domainMin=Math.min(...tasks.map(t=>t.start)),domainMax=Math.max(...tasks.map(t=>t.end));
  const nativeW=svg.viewBox.baseVal.width;
  const scale=t=>Number(gc.leftPadding)+(domainMax===domainMin?.5:(t-domainMin)/(domainMax-domainMin))*(nativeW-Number(gc.leftPadding)-Number(gc.rightPadding));
  const rows=[...svg.querySelectorAll('rect.section')].sort((a,b)=>Number(a.getAttribute('y'))-Number(b.getAttribute('y')));
  if(options.mode==='styled'){
    // Add stripes behind native excluded-date shading and native task geometry.
    const background=make('g',{'data-styled-layer':'rows'});
    for(const [i,row]of rows.entries()){
      const y=Number(row.getAttribute('y')),h=Number(row.getAttribute('height'));
      background.append(make('rect',{x:0,y,width:nativeW,height:h,fill:i%2?'#EDF3FA':'#FFFFFF'}));
      background.append(make('line',{x1:0,y1:y+h,x2:nativeW,y2:y+h,stroke:'#DCE5F0','stroke-width':.6}));
      row.style.setProperty('opacity','0','important');
    }
    const firstGroup=svg.querySelector('g');svg.insertBefore(background,firstGroup);
    for(const t of tasks){
      if(!canMap)break;
      const {rect,text}=nodePair(svg,t);if(!rect||!text)continue;
      const color=t.crit?'#DC2626':t.done?'#94A3B8':t.active?'#2563EB':'#3B82F6';
      const fill=t.crit?'#FEE2E2':t.done?'#E2E8F0':t.active?'#BFDBFE':'#DBEAFE';
      rect.style.setProperty('fill',fill,'important');rect.style.setProperty('stroke',color,'important');
      text.style.setProperty('fill',t.crit?'#A82C2C':'#17324D','important');
      text.style.setProperty('font-style','normal','important');
      if(canMap&&!compact&&!t.vert){
        const r=rect.getBBox();
        // A milestone is a rotated square; account for its visual right edge.
        const right=t.milestone?r.x+r.width/2+r.width/Math.sqrt(2):r.x+r.width;
        text.setAttribute('x',String(right+10));text.style.setProperty('text-anchor','start','important');
        if(options.dates!=='off'){
          const format=value=>{
            const d=new Date(value),parts=new Intl.DateTimeFormat('en-CA',{timeZone:options.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d),p=Object.fromEntries(parts.map(v=>[v.type,v.value]));
            const subday=(t.start%86400000!==t.end%86400000)||(t.end-t.start>0&&t.end-t.start<86400000);
            return `${p.month}/${p.day}${subday?' '+p.hour+':'+p.minute+((t.start%60000!==0||t.end%60000!==0)?':'+p.second+((t.start%1000!==0||t.end%1000!==0)?'.'+String(d.getUTCMilliseconds()).padStart(3,'0'):''):''):''}`;
          };
          const label=t.milestone?format((t.start+t.end)/2):`${format(t.start)}–${format(t.end)}`;
          const dateEl=make('text',{x:r.x-10,y:Number(text.getAttribute('y')),'text-anchor':'end','font-size':Math.max(11,font-3),fill:'#64748B',class:'styled-date'},label);
          dateEl.style.fill='#64748B';svg.append(dateEl);
        }
      }
    }
    // Lane boundaries follow the actual native task rows, including compact layouts.
    const laneLayer=make('g',{'data-styled-layer':'lanes','pointer-events':'none'});
    const nativeTitles=[...svg.querySelectorAll('text.sectionTitle')];
    const laneWidth=Math.min(Math.max(80,...nativeTitles.map(t=>t.getBBox().width+32)),Math.max(60,Number(gc.leftPadding)*.45));
    const rowSections=rows.map(row=>{
      const y=Number(row.getAttribute('y')),h=Number(row.getAttribute('height'));
      const task=tasks.find(t=>{if(t.vert)return false;const r=nodePair(svg,t).rect;if(!r)return false;const ty=Number(r.getAttribute('y'));return ty>=y-.5&&ty<y+h-.5;});
      return {y,h,section:task?.section??''};
    });
    const runs=[];
    for(const row of rowSections){const last=runs.at(-1);if(last&&last.section===row.section){last.end=row.y+row.h;}else runs.push({section:row.section,start:row.y,end:row.y+row.h});}
    for(const [i,lane]of runs.entries()){
      laneLayer.append(make('rect',{x:0,y:lane.start,width:laneWidth,height:lane.end-lane.start,fill:i%2?'#DDE7F2':'#E8EFF7','data-lane':lane.section}));
      laneLayer.append(make('rect',{x:0,y:lane.start,width:4,height:lane.end-lane.start,fill:'#7895B5'}));
      laneLayer.append(make('line',{x1:0,x2:nativeW,y1:lane.start,y2:lane.start,stroke:'#7895B5','stroke-width':2,'data-lane-boundary':'start'}));
      laneLayer.append(make('line',{x1:laneWidth,x2:laneWidth,y1:lane.start,y2:lane.end,stroke:'#B5C7DA','stroke-width':1}));
    }
    if(runs.length)laneLayer.append(make('line',{x1:0,x2:nativeW,y1:runs.at(-1).end,y2:runs.at(-1).end,stroke:'#7895B5','stroke-width':2,'data-lane-boundary':'end'}));
    // Draw the lane layer above the grid but below section names; geometry is untouched.
    svg.append(laneLayer);
    for(const title of nativeTitles){title.style.fontWeight='600';title.style.fill='#17324D';title.style.textAnchor='middle';title.setAttribute('x',String(laneWidth/2));for(const span of title.querySelectorAll('tspan'))span.setAttribute('x',String(laneWidth/2));svg.append(title);}

    for(const tick of svg.querySelectorAll('.grid text')){tick.style.setProperty('font-size',Math.max(11,font-3)+'px','important');tick.style.fill='#64748B';}
    let hiddenTicks=0;
    for(const grid of svg.querySelectorAll('g.grid')){
      let previousRight=-Infinity,previousLabel=null;
      for(const tick of grid.querySelectorAll('.tick text')){
        const b=tick.getBoundingClientRect(),label=tick.textContent;
        if(b.left<previousRight+8||label===previousLabel){tick.style.visibility='hidden';hiddenTicks++;}
        else{previousRight=b.right;previousLabel=label;}
      }
    }
    if(hiddenTicks)warnings.push(`为避免刻度文字重叠，隐藏了 ${hiddenTicks} 个重复或过密的刻度标签；原生网格与时间位置未改变。`);
    for(const grid of svg.querySelectorAll('.grid line')){grid.style.stroke='#DCE5F0';grid.style.strokeOpacity='.8';}
    const title=svg.querySelector('text.titleText');if(title){title.style.fontWeight='600';title.style.fontSize=(font+12)+'px';title.setAttribute('x','12');title.style.textAnchor='start';}
  }
  if(options.today==='off')svg.querySelectorAll('g.today').forEach(el=>el.remove());
  else if(svg.querySelector('g.today')){
    const l=svg.querySelector('g.today line'),x=Number(l?.getAttribute('x1'));
    if(x<Number(gc.leftPadding)||x>nativeW-Number(gc.rightPadding)){
      svg.querySelector('g.today').remove();warnings.push('当前日期超出图内时间轴范围，未显示当前日期线。');
    }else if(options.mode==='styled'){l.style.stroke='#D99B28';l.style.strokeWidth='1.2px';l.style.strokeDasharray='4 4';}
  }
  if(options.release){
    const value=Date.parse(options.release.length===10?options.release+'T00:00:00'+(options.timezone==='UTC'?'Z':''):options.release);
    if(!Number.isFinite(value)||value<domainMin||value>domainMax)throw new Error('release 日期必须有效且在官方时间轴范围内（可使用 Mermaid vert 扩展范围）');
    const x=scale(value),y0=rows.length?Number(rows[0].getAttribute('y')):50,y1=rows.length?Math.max(...rows.map(r=>+r.getAttribute('y')+ +r.getAttribute('height'))):svg.viewBox.baseVal.height-30;
    svg.append(make('line',{x1:x,x2:x,y1:y0,y2:y1,stroke:'#DC2626','stroke-width':1.5,'stroke-dasharray':'4 4','data-styled-layer':'release'}));
  }
  const after=geometry();
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('样式处理改变了官方任务几何，已终止导出');
  // Expand only the outer canvas to retain long labels; never change task bar positions.
  const bounds=svg.getBBox(),vb=svg.viewBox.baseVal;
  const minX=Math.min(0,bounds.x-8),minY=Math.min(0,bounds.y-8),maxX=Math.max(vb.width,bounds.x+bounds.width+8),maxY=Math.max(vb.height,bounds.y+bounds.height+8);
  const chartW=maxX-minX,chartH=maxY-minY,targetW=options.width-48,ratio=targetW/chartW;
  const footer=options.mode==='styled'||options.note?70+(options.note?font+28:0):0;
  const naturalH=Math.ceil(chartH*ratio+48+footer);
  const height=options.height??(options.aspect?Math.round(options.width*Number(options.aspect.split(':')[1])/Number(options.aspect.split(':')[0])):naturalH);
  if(height<naturalH)throw new Error(`高度 ${height}px 不足，至少需要 ${naturalH}px；使用自动高度、增加宽高或减小字号/行高。`);
  const output=make('svg',{xmlns:ns,width:options.width,height,viewBox:`0 0 ${options.width} ${height}`});
  output.append(make('rect',{width:'100%',height:'100%',fill:'white'}));
  svg.setAttribute('x','24');svg.setAttribute('y','24');svg.setAttribute('width',String(targetW));svg.setAttribute('height',String(chartH*ratio));svg.setAttribute('viewBox',`${minX} ${minY} ${chartW} ${chartH}`);svg.style.maxWidth='none';
  output.append(svg);
  let fy=24+chartH*ratio+28;
  if(options.mode==='styled'){
    const legend=make('text',{x:28,y:fy,'font-family':options.fontFamily,'font-size':Math.max(12,font-3),fill:'#17324D'},'灰色：已完成　　蓝色：计划　　红色：风险 / 延期　　◆ 里程碑　　浅黄色：排除日期');output.append(legend);fy+=28;
  }
  if(options.note){output.append(make('rect',{x:24,y:fy-5,width:options.width-48,height:font+25,rx:6,fill:'#EFF6FF'}));output.append(make('text',{x:40,y:fy+font,'font-size':font,'font-family':options.fontFamily,'font-weight':600,fill:'#17324D'},`${options.noteLabel}　${options.note}`));}
  const mount=document.querySelector('#mount');mount.replaceChildren(output);await document.fonts.ready;
  const overflow=[...output.querySelectorAll('text')].filter(t=>{const b=t.getBoundingClientRect(),o=output.getBoundingClientRect();return b.left<o.left-1||b.right>o.right+1||b.top<o.top-1||b.bottom>o.bottom+1;}).map(t=>t.textContent);
  if(overflow.length)throw new Error('文字超出最终画布，请加宽、减小字号或缩短备注：'+overflow.slice(0,5).join('；'));
  return {svg:new XMLSerializer().serializeToString(output),rawSvg:nativeRaw,width:options.width,height,warnings,mermaidVersion:'11.17.2',renderTimezone:options.timezone,currentInstant:new Date().toISOString(),tasks,geometryBefore:before,geometryAfter:after,nativeViewBox,compact,excludedRanges:svg.querySelectorAll('.exclude-range').length,laneCount:svg.querySelectorAll('[data-lane]').length,laneBoundaryCount:svg.querySelectorAll('[data-lane-boundary]').length};
}

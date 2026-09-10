const FLAGS=new Set(['done','active','crit','milestone','vert']);
// Locate one explicit task ID; scheduling remains the official engine's responsibility.
export function findTaskLine(source,task){
 const lines=source.split('\n'),matches=[];
 for(let i=0;i<lines.length;i++){
  const match=/^(\s*)([^:\n]+?)(\s*):(.*?)(\r?)$/.exec(lines[i]);if(!match||match[2].trim()!==String(task.label).trim())continue;
  const tokens=match[4].split(',').map(t=>t.trim());let count=0;while(FLAGS.has(tokens[count]))count++;
  if(tokens[count]!==task.id)continue;
  matches.push({index:i,original:lines[i],indent:match[1],label:match[2].trim(),gap:match[3],ending:match[5],flags:tokens.slice(0,count),id:tokens[count],schedule:tokens.slice(count+1).join(', ')});
 }
 return matches.length===1?matches[0]:null;
}
export function patchTask(source,task,expected,edit){
 const line=findTaskLine(source,task);if(!line||line.original!==expected)throw new Error('任务源码已变化，请等待预览更新后重新选择任务。');
 const label=edit.label.trim(),schedule=edit.schedule.trim();
 if(!label||/[\r\n:]/.test(label))throw new Error('任务名称不能为空，也不能含冒号或换行。');
 if(!schedule||/[\r\n]/.test(schedule)||schedule.split(',').some(v=>!v.trim()))throw new Error('请填写有效的开始时间 / 依赖与结束时间 / 工期，不要换行或留空项。');
 const flags=line.flags.filter(f=>!['done','active','crit','milestone'].includes(f));
 if(edit.done)flags.push('done');if(edit.active)flags.push('active');if(edit.crit)flags.push('crit');if(edit.milestone)flags.push('milestone');
 const lines=source.split('\n');lines[line.index]=`${line.indent}${label}${line.gap}:`+[...flags,line.id,schedule].join(', ')+line.ending;
 return lines.join('\n');
}

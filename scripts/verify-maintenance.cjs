const {session}=require('./cloud-session.cjs');const fs=require('node:fs/promises');
(async()=>{
 const {project,request}=await session();const base=`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs`;
 const list=await request(base);const job=(list.jobs||[]).find(j=>j.name.endsWith('/firebase-schedule-dailyMaintenance-us-central1'));
 if(!job||job.state!=='ENABLED')throw Error('Enabled maintenance schedule not found');
 await request('https://cloudscheduler.googleapis.com/v1/'+job.name+':run','POST',{});
 const safe={name:job.name,state:job.state,schedule:job.schedule,timeZone:job.timeZone,manualRunRequestedAt:new Date().toISOString()};
 await fs.writeFile('artifacts/production-review/maintenance-schedule.json',JSON.stringify(safe,null,2));console.log('Verified enabled daily maintenance job and requested its normal production execution.');
})().catch(e=>{console.error(e.message);process.exitCode=1});

"use client";
import { useLive } from "./useLive";
export function HashtagOptions({platform,account,id}:{platform:string;account:number|null;id:string}){
 const {data}=useLive<{hashtags:{tag:string;videos:number}[]}>(`/api/hashtags?platform=${platform}${account?`&account=${account}`:""}`,120000);
 const tags=new Map((data?.hashtags||[]).map(t=>[t.tag,t.videos]));
 for(const tag of ["ewc","vct","tsw"])if(!tags.has(tag))tags.set(tag,0);
 return <datalist id={id}>{[...tags].map(([tag,n])=><option key={tag} value={`#${tag}`}>{n?`${n} videos`:tag==="tsw"?"Team Secret Whales":"Campaign hashtag"}</option>)}</datalist>;
}

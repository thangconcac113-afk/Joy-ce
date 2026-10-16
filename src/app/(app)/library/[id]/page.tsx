import { VideoDetail } from "@/components/VideoDetail";
export const metadata = {title:"Video detail · TS Video Tracker"};
export default async function Page({params}:{params:Promise<{id:string}>}){return <VideoDetail id={(await params).id}/>;}

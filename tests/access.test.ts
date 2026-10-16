import { describe,expect,it,vi } from "vitest";
const state = vi.hoisted(()=>({ user: null as {email:string}|null, manager:false }));
vi.mock("@/auth",()=>({currentUser:async()=>state.user,canManageEmail:()=>state.manager}));
import { withManager,parseFilters } from "@/lib/api";
describe("workspace permissions",()=>{
 it("denies signed-out users and read-only viewers before a mutation runs",async()=>{
   const mutate=vi.fn(async()=>new Response("ok"));
   state.user=null; expect((await withManager(mutate)).status).toBe(401);
   state.user={email:"viewer@example.test"};state.manager=false;
   expect((await withManager(mutate)).status).toBe(403);expect(mutate).not.toHaveBeenCalled();
   state.manager=true;expect((await withManager(mutate)).status).toBe(200);expect(mutate).toHaveBeenCalledOnce();
 });
 it("rejects inherited range keys and invalid account filters",()=>{
   expect(parseFilters(new URL("https://local/?range=__proto__&account=-1&platform=invalid"))).toEqual({range:"7d",platform:"all",accountId:null});
 });
});

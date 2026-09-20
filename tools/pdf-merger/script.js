let files=[],dragIndex=null;
const $=id=>document.getElementById(id),drop=$("drop"),input=$("input"),list=$("list"),status=$("status"),merge=$("merge");

drop.onclick=()=>input.click();$("add").onclick=()=>input.click();
input.onchange=e=>{addFiles([...e.target.files]);input.value=""};
["dragenter","dragover"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.add("over")}));
["dragleave","drop"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.remove("over")}));
drop.addEventListener("drop",e=>addFiles([...e.dataTransfer.files]));

function addFiles(a){
 const v=a.filter(f=>f.type==="application/pdf"||/\.pdf$/i.test(f.name));
 if(!v.length)return setStatus("Please select valid PDF files.","err");
 files.push(...v); sortDefault(); render(); setStatus(v.length+" PDF file(s) added.","ok");
}
function prefix(n){let m=n.match(/^(\d+)_/);return m?+m[1]:null}
function sortDefault(){files.sort((a,b)=>{let x=prefix(a.name),y=prefix(b.name);if(x!==null&&y!==null)return x-y;if(x!==null)return-1;if(y!==null)return 1;return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"})})}
function render(){
 list.innerHTML="";
 if(!files.length){list.innerHTML='<div class="empty">No PDF files added yet.</div>';return}
 files.forEach((f,i)=>{
  const d=document.createElement("div");d.className="item";d.draggable=true;d.dataset.i=i;
  d.innerHTML=`<div class="handle">⠿</div><div class="num">${i+1}</div><div class="info"><div class="name">${esc(f.name)}</div><div class="size">${size(f.size)}</div></div><button class="delete" data-del="${i}">✕ Delete</button>`;
  d.addEventListener("dragstart",()=>{dragIndex=i;d.classList.add("dragging")});
  d.addEventListener("dragend",()=>{dragIndex=null;d.classList.remove("dragging")});
  d.addEventListener("dragover",e=>e.preventDefault());
  d.addEventListener("drop",e=>{e.preventDefault();let target=i;if(dragIndex===null||dragIndex===target)return;let moved=files.splice(dragIndex,1)[0];files.splice(target,0,moved);render()});
  list.appendChild(d);
 });
}
list.onclick=e=>{let b=e.target.closest("[data-del]");if(b){files.splice(+b.dataset.del,1);render()}};
$("clear").onclick=()=>{if(files.length&&confirm("Remove all PDF files?")){files=[];render();setStatus("All files cleared.","ok")}};

function setStatus(t,c){status.textContent=t;status.className="status "+c}
function size(b){if(!b)return"0 Bytes";let u=["Bytes","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(1024));return +(b/1024**i).toFixed(2)+" "+u[i]}
function esc(t){let d=document.createElement("div");d.textContent=t;return d.innerHTML}

function cleanTitle(name){
 return name.replace(/\.pdf$/i,"").replace(/^\d+_/,"").replace(/[_-]+/g," ").trim()||name;
}
function wrapText(text,font,size,maxWidth){
 const words=text.split(/\s+/),lines=[];let line="";
 for(const w of words){let test=line?line+" "+w:w;if(font.widthOfTextAtSize(test,size)<=maxWidth)line=test;else{if(line)lines.push(line);line=w}}
 if(line)lines.push(line);return lines;
}
function addLink(page,x,y,w,h,targetPage){
 const {PDFName,PDFArray,PDFNumber}=PDFLib;
 const annots=page.node.lookup(PDFName.of("Annots"),PDFLib.PDFArray)||page.node.context.obj([]);
 const rect=page.node.context.obj([x,y,x+w,y+h]);
 const dest=page.node.context.obj([targetPage.ref,PDFName.of("XYZ"),PDFNumber.of(0),PDFNumber.of(targetPage.getHeight()),null]);
 const annot=page.node.context.obj({Type:"Annot",Subtype:"Link",Rect:rect,Border:[0,0,0],A:{Type:"Action",S:"GoTo",D:dest}});
 annots.push(annot);page.node.set(PDFName.of("Annots"),annots);
}
function addPageNumber(page,num,font){
 const txt=String(num),s=9,w=font.widthOfTextAtSize(txt,s),pw=page.getWidth();
 page.drawText(txt,{x:(pw-w)/2,y:18,size:s,font,color:PDFLib.rgb(.35,.35,.35)});
}

merge.onclick=async()=>{
 if(files.length<1)return setStatus("Add at least one PDF.","err");
 if(typeof PDFLib==="undefined")return setStatus("PDF library did not load. Check internet and reload.","err");
 merge.disabled=true;let old=merge.textContent;merge.textContent="⏳ Creating...";
 try{
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  setStatus("Reading PDFs and preparing index...","work");
  const loaded=[],pageCounts=[];
  for(let i=0;i<files.length;i++){
   setStatus(`Reading ${i+1} of ${files.length}: ${files[i].name}`,"work");
   try{let d=await PDFDocument.load(await files[i].arrayBuffer(),{ignoreEncryption:true});loaded.push(d);pageCounts.push(d.getPageCount())}
   catch(e){throw new Error(`Could not read "${files[i].name}": ${e.message}`)}
  }
  const out=await PDFDocument.create(),font=await out.embedFont(StandardFonts.Helvetica),bold=await out.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,margin=55,rowH=25,titleY=H-90,usable=H-145-55;
  const entriesPerPage=Math.max(1,Math.floor(usable/rowH));
  const indexPages=Math.ceil(files.length/entriesPerPage);
  const startPages=[];let cursor=indexPages+1;
  for(let i=0;i<files.length;i++){startPages.push(cursor);cursor+=pageCounts[i]}
  const index=[];
  for(let k=0;k<indexPages;k++){let pg=out.addPage([W,H]);index.push(pg)}
  // copy all source pages
  const sourceStartPageObjs=[];
  for(let i=0;i<loaded.length;i++){
   setStatus(`Adding ${i+1} of ${files.length}: ${files[i].name}`,"work");
   const copied=await out.copyPages(loaded[i],loaded[i].getPageIndices());
   sourceStartPageObjs[i]=copied[0];
   copied.forEach(pg=>out.addPage(pg));
  }
  // index drawing and links
  for(let k=0;k<index.length;k++){
   const pg=index[k],from=k*entriesPerPage,to=Math.min(files.length,from+entriesPerPage);
   pg.drawText(k===0?"INDEX":"INDEX (Continued)",{x:margin,y:titleY,size:24,font:bold,color:rgb(.32,.24,.38)});
   if(k===0)pg.drawText("Click an entry to jump to the first page of that document.",{x:margin,y:titleY-30,size:10,font,color:rgb(.42,.42,.42)});
   let y=titleY-65;
   for(let i=from;i<to;i++){
    const title=cleanTitle(files[i].name),label=`${i+1}. ${title}`,pageLabel=String(startPages[i]);
    const lines=wrapText(label,font,11,W-margin*2-70);
    const h=Math.max(rowH,lines.length*14+7);
    let ty=y;
    lines.forEach((ln,j)=>pg.drawText(ln,{x:margin+5,y:ty-j*14,size:11,font,color:rgb(.08,.25,.55)}));
    const pw=font.widthOfTextAtSize(pageLabel,11);
    pg.drawText(pageLabel,{x:W-margin-pw,y:ty,size:11,font:bold,color:rgb(.25,.25,.25)});
    addLink(pg,margin,y-h+3,W-margin*2,h,sourceStartPageObjs[i]);
    y-=h;
   }
  }
  // home button on first page of each source
  const allPages=out.getPages();
  for(let i=0;i<files.length;i++){
   const pg=sourceStartPageObjs[i];
   const x=pg.getWidth()-78,y=pg.getHeight()-30,w=58,h=18;
   pg.drawRectangle({x,y,width:w,height:h,color:rgb(.72,.28,.08),borderColor:rgb(.55,.20,.04),borderWidth:.5});
   pg.drawText("HOME",{x:x+10,y:y+5,size:8,font:bold,color:rgb(1,1,1)});
   addLink(pg,x,y,w,h,index[0]);
  }
  // page numbering includes index
  out.getPages().forEach((pg,i)=>addPageNumber(pg,i+1,font));
  setStatus("Saving indexed PDF...","work");
  const bytes=await out.save();
  const blob=new Blob([bytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="Merged_PDF_with_Index.pdf";a.style.display="none";document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},15000);
  setStatus(`Done. ${files.length} file(s) merged with ${indexPages} index page(s).`,"ok");
 }catch(e){console.error(e);setStatus("Merge failed: "+e.message,"err")}
 finally{merge.disabled=false;merge.textContent=old}
};
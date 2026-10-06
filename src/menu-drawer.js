// The drawer is non-modal: only its off-screen controls become inert.
// CSS owns the slide, so rapid toggles can reverse without timers or locks.
export function initMenuDrawer(toggle,panel,drawer){
  const doc=drawer.ownerDocument;
  const isOpen=()=>drawer.dataset.open==='true';
  const setOpen=value=>{
    const open=Boolean(value);
    if(!open&&panel.contains(doc.activeElement))toggle.focus({preventScroll:true});
    drawer.dataset.open=String(open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'메뉴 접기':'메뉴 열기');
    panel.inert=!open;
    panel.setAttribute('aria-hidden',String(!open));
  };
  toggle.addEventListener('click',()=>setOpen(!isOpen()));
  doc.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!isOpen())return;
    event.preventDefault();setOpen(false);toggle.focus({preventScroll:true});
  });
  doc.addEventListener('pointerdown',event=>{
    if(isOpen()&&!drawer.contains(event.target))setOpen(false);
  });
  setOpen(false);
  return {setOpen};
}

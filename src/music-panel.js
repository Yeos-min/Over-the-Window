// CSS grid interpolates the intrinsic content height, including on rapid reversal.
// Collapsing the settings does not disconnect audio or recreate its controls.
export function initMusicPanel(toggle,content){
  toggle.addEventListener('click',()=>{
    const expanded=toggle.getAttribute('aria-expanded')!=='true';
    if(!expanded&&content.contains(content.ownerDocument.activeElement))toggle.focus();
    toggle.setAttribute('aria-expanded',String(expanded));
    content.inert=!expanded;
  });
}

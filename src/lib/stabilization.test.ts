import {describe,it,expect} from 'vitest';
import {detailReadState,isRealPublicLive,scannerReturnPath,catalogEmptyKind} from './stabilization';
import {safeAuthReturnTo} from './authFlow';
describe('Phase 1 public stabilization',()=>{
  it('finishes an absent or expired protected item read without exposing details',()=>expect(detailReadState(null,null)).toBe('unavailable'));
  it('distinguishes failed reads from missing items',()=>expect(detailReadState(null,{message:'denied'})).toBe('error'));
  it('keeps successful visible items available',()=>expect(detailReadState({id:'visible'},null)).toBe('ready'));
  it('does not count demo or private live streams',()=>{
    expect(isRealPublicLive({status:'live',is_demo:true})).toBe(false);
    expect(isRealPublicLive({status:'live',is_demo:false,is_private:true})).toBe(false);
    expect(isRealPublicLive({status:'live',is_demo:false,is_private:false})).toBe(true);
    expect(isRealPublicLive({status:'ended',is_demo:false})).toBe(false);
  });
  it('retains scanner intent through safe sign-in return',()=>expect(safeAuthReturnTo(scannerReturnPath(true),'https://pullbidlive.com')).toBe('/vault?scan=true'));
  it('ordinary Vault navigation does not request scanner mode',()=>expect(scannerReturnPath(false)).toBe('/vault'));
  it('does not mistake an empty catalog or error for unmatched filters',()=>{
    expect(catalogEmptyKind(false,false)).toBe('empty_catalog');
    expect(catalogEmptyKind(true,false)).toBe('no_matches');
    expect(catalogEmptyKind(false,true)).toBe('error');
  });
});
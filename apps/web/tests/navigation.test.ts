import assert from 'node:assert/strict';
import test from 'node:test';
import { findNavigation,isActivePath,navigation,navigationItems } from '../src/layouts/navigation';

test('navigation keeps five daily destinations without removing any existing page',()=>{
 assert.deepEqual(navigation[0].items.map(item=>item.path),['/','/expenses','/banking','/portfolio','/planning']);
 const expected=['/','/planning','/expenses','/portfolio','/networth','/real-estate','/banking','/transactions','/reports','/salary','/taxes','/debts','/projects','/import'];
 assert.deepEqual(navigationItems.map(item=>item.path).sort(),expected.sort());
 assert.equal(new Set(navigationItems.map(item=>item.path)).size,14);
});
test('active navigation uses route boundaries, including nested investment pages',()=>{
 assert.equal(isActivePath('/','/'),true);assert.equal(isActivePath('/expenses','/'),false);
 assert.equal(isActivePath('/portfolio/IE000','/portfolio'),true);
 assert.equal(isActivePath('/portfolio-other','/portfolio'),false);
});
test('section search accepts accents, descriptions and direct expense tasks',()=>{
 assert.equal(findNavigation('nominas')[0].path,'/salary');
 assert.equal(findNavigation('prestamos')[0].path,'/debts');
 assert.ok(findNavigation('gastos tarjeta').some(item=>item.path==='/expenses'));
 assert.equal(findNavigation('categorizar')[0].path,'/expenses?tab=uncategorized');
 assert.equal(findNavigation('iphone')[0].path,'/expenses?tab=setup');
 assert.deepEqual(findNavigation('not-a-section'),[]);
 assert.equal(findNavigation('').length,18);
});

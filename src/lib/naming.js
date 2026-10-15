// L'Oréal naming convention, ported from the Power App (brCampName, brIOName, brLIName, brAGName, brADNameN).
// x = a missing input, exactly as in the original.
import { AUDS, CATS, DEVICES, LANGS, OBJS, SUST } from './constants.js';
import { coalesce, isBlank, txt } from './util.js';

const finish = (s) => s.split(' ').join('-').toLowerCase(); // Lower(Substitute(s, " ", "-"))
const X = (v) => coalesce(v, 'X');
const find = (list, name) => list.find((x) => x.name === name);
const brandCode = (brands, brand) => (brands.find((b) => b.brand_name === brand) || {}).brand_code;

export function campaignName(b, brands) {
  return finish(
    X(brandCode(brands, b.brand)) + '_' + X(find(CATS, b.category)?.abv) + '_' + X(b.franchise) + '_' +
    X(b.campaign_desc) + (isBlank(b.campaign_other) ? '' : '_' + b.campaign_other)
  );
}

export function ioName(b, i, brands) {
  return finish(
    X(brandCode(brands, b.brand)) + '_' + X(find(CATS, b.category)?.abv) + '_' + X(b.franchise) + '_' +
    X(b.campaign_desc) + '_' + X(i.io_type) + '-' + X(find(OBJS, i.io_objective)?.abv) + '-' + X(i.kpi_model) +
    (isBlank(i.io_other) ? '' : '_' + i.io_other)
  );
}

export function lineItemName(l) {
  const aud = find(AUDS, l.aud_targeting);
  return finish(
    X(l.deal_type) + (l.deal_type === 'Youtube' ? '-' + X(l.yt_li_type) : '') + '_' +
    X(aud?.type) + '-' + X(aud?.abv) + '_' + X(l.aud_tactic) + '_' + X(l.gender) + '_' +
    X(txt(l.age_min)) + '-' + X(txt(l.age_max)) + '_' + X(find(LANGS, l.language)?.abv) + '_' +
    X(find(DEVICES, l.device)?.abv) + '_' + X(l.environment) + '_' + X(l.dims) + '_' +
    X(find(SUST, l.sustainability)?.abv) + (l.service_disc === 'YES' ? '_SERVICE' : '') + '_' + X(l.publisher_name)
  );
}

export function adGroupName(g) {
  const aud = find(AUDS, g.aud_targeting);
  return finish(
    X(aud?.type) + '-' + X(aud?.abv) + '_' + X(g.aud_tactic) + '_' + X(g.gender) + '_' +
    X(txt(g.age_min)) + '-' + X(txt(g.age_max)) + '_' + X(find(LANGS, g.language)?.abv) + '_' +
    X(g.video_ad_format) + (isBlank(g.ag_other) ? '' : '_' + g.ag_other)
  );
}

function redirectPart(a) {
  switch (a.redirect) {
    case 'E-retailers': return 'e-' + txt(a.retailer);
    case 'Others': return coalesce(a.retailer, 'other');
    case "L'Oréal D2C": return 'd2c';
    case "L'Oréal non-D2C": return 'non-d2c';
    case 'None': return 'noredirect';
    default: return 'X';
  }
}

export function adName(a) {
  return finish(
    X(a.asset_desc) + '_' + X(a.asset_source) + '_' + X(a.ad_format) + '_' +
    (Number(a.video_length) > 0 ? txt(a.video_length) : 'X') + '_' + X(a.cta_code) + '_' + X(a.skippable) + '_' +
    X(a.ad_buying_type) + '_' + X(a.rotation) + '_' + redirectPart(a) + (isBlank(a.ad_other) ? '' : '_' + a.ad_other)
  );
}

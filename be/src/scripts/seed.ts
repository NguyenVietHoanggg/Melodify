/**
 * Reference data + generated content. Safe to re-run at any time (everything is an upsert).
 *
 *   npm run db:seed
 */
import { sql } from '../db/client';
import { PLANS, PREPAID_OPTIONS } from '../modules/billing/plans';
import { assignCategoryArt } from '../modules/browse/categoryArt';
import { generateEditorialPlaylists } from '../modules/catalog/editorial';
import { CATEGORY_SEED } from '../modules/music/taxonomy';
import { rebuildCooccurrence } from '../modules/reco/cooccurrence';
import { ensureRadio } from '../modules/reco/radio';

const log = (...a: unknown[]) => console.log('•', ...a);

/** House ads for Free listeners. Audio ads are read aloud by the browser's speech engine (tts_script). */
const ADS = [
  {
    advertiser: 'Melodify Premium',
    title: 'Nghe nhạc không quảng cáo',
    body: 'Dùng thử Premium 2 tháng chỉ với 65.000 ₫. Hủy bất cứ lúc nào.',
    ttsScript:
      'Bạn đang nghe Melodify miễn phí. Nâng cấp lên Premium để nghe nhạc không quảng cáo, dùng Smart Shuffle và tính năng Mix. Dùng thử hai tháng chỉ sáu mươi lăm nghìn đồng.',
    ctaLabel: 'Dùng thử Premium',
    clickUrl: '/premium',
    bgColor: '#1e3264',
    weight: 4,
  },
  {
    advertiser: 'Melodify',
    title: 'Đưa nhạc của bạn lên Melodify',
    body: 'Tải bản nhạc của riêng bạn lên, chọn công khai hoặc riêng tư, và chia sẻ với cộng đồng.',
    ttsScript:
      'Bạn có bài hát của riêng mình? Hãy tải lên Melodify, chọn công khai hoặc riêng tư, và để cộng đồng lắng nghe bạn.',
    ctaLabel: 'Tải nhạc lên',
    clickUrl: '/uploads',
    bgColor: '#8400e7',
    weight: 2,
  },
  {
    advertiser: 'Melodify Premium',
    title: 'Smart Shuffle — đúng gu bạn',
    body: 'Để Melodify xen những bài hợp vibe vào playlist của bạn. Chỉ có trên Premium.',
    ttsScript:
      'Playlist của bạn nghe mãi đã quen? Bật Smart Shuffle trên Melodify Premium để khám phá những bài hát hợp gu được xen vào một cách thông minh.',
    ctaLabel: 'Khám phá Premium',
    clickUrl: '/premium',
    bgColor: '#27856a',
    weight: 2,
  },
  {
    advertiser: 'Cà Phê Sương Mai (quảng cáo minh hoạ)',
    title: 'Cà phê sáng, nhạc hay',
    body: 'Thương hiệu hư cấu dùng để minh hoạ quảng cáo trong bản học tập này.',
    ttsScript:
      'Một ngày mới bắt đầu bằng ly cà phê thơm và bài nhạc bạn yêu. Đây là quảng cáo minh hoạ của Melodify.',
    ctaLabel: 'Tìm hiểu thêm',
    clickUrl: '/premium',
    bgColor: '#7d4b32',
    weight: 1,
  },
];

/** Rough speaking time for Vietnamese TTS (~3 words/second) so the backend knows when an ad "should" end. */
const speechMs = (text: string) => Math.round((text.split(/\s+/).length / 3) * 1000) + 1500;

async function main() {
  // Plans & prices — the DB copy is what the checkout actually charges.
  for (const [i, p] of PLANS.entries()) {
    await sql`
      insert into plans (id, name, monthly_price, intro_months, intro_price, accounts, requires_verification, color, position)
      values (${p.id}, ${p.name}, ${p.monthlyPrice}, ${p.introMonths}, ${p.introPrice}, ${p.accounts}, ${p.requiresVerification}, ${p.color}, ${i})
      on conflict (id) do update set
        name = excluded.name, monthly_price = excluded.monthly_price, intro_months = excluded.intro_months,
        intro_price = excluded.intro_price, accounts = excluded.accounts,
        requires_verification = excluded.requires_verification, color = excluded.color, position = excluded.position`;
  }
  for (const [i, o] of PREPAID_OPTIONS.entries()) {
    await sql`
      insert into prepaid_options (id, plan_id, months, price, position)
      values (${o.id}, ${o.planId}, ${o.months}, ${o.price}, ${i})
      on conflict (id) do update set plan_id = excluded.plan_id, months = excluded.months, price = excluded.price, position = excluded.position`;
  }
  log(`plans: ${PLANS.length}, prepaid options: ${PREPAID_OPTIONS.length}`);

  for (const [i, c] of CATEGORY_SEED.entries()) {
    await sql`
      insert into categories (id, name_vi, name_en, color, kind, query, position)
      values (${c.id}, ${c.vi}, ${c.en}, ${c.color}, ${c.kind}, ${sql.json(c.query as never)}, ${i})
      on conflict (id) do update set
        name_vi = excluded.name_vi, name_en = excluded.name_en, color = excluded.color,
        kind = excluded.kind, query = excluded.query, position = excluded.position`;
  }
  log(`categories: ${CATEGORY_SEED.length}`);

  await sql`delete from ads where advertiser in ${sql(ADS.map((a) => a.advertiser))}`;
  for (const a of ADS) {
    await sql`
      insert into ads (advertiser, title, body, format, tts_script, tts_lang, duration_ms, cta_label, click_url, bg_color, weight)
      values (${a.advertiser}, ${a.title}, ${a.body}, 'audio', ${a.ttsScript}, 'vi-VN', ${speechMs(a.ttsScript)},
              ${a.ctaLabel}, ${a.clickUrl}, ${a.bgColor}, ${a.weight})`;
  }
  log(`ads: ${ADS.length}`);

  const [{ n: trackCount } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from tracks where origin = 'catalog'`;
  if (trackCount === 0) {
    log('catalog is empty — run "npm run import:audius" first, then seed again for playlists & recommendations');
  } else {
    const made = await generateEditorialPlaylists(log);
    log(`editorial playlists: ${made}`);
    // Card art for the Search page ("Browse all" tiles), all different.
    log(`category images: ${await assignCategoryArt()}`);
    const pairs = await rebuildCooccurrence();
    log(`co-occurrence pairs: ${pairs}`);
    // "Popular radio": shared artist radios for the biggest artists (recommendations need co-occurrence first).
    const top = await sql<{ id: string }[]>`
      select ar.id from artists ar
       where ar.owner_id is null and exists (select 1 from track_artists ta where ta.artist_id = ar.id)
       order by ar.monthly_listeners desc limit 24`;
    for (const a of top) await ensureRadio('artist', a.id, true);
    log(`artist radios: ${top.length}`);
  }
  await sql.end();
  console.log('✓ Seed complete');
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});

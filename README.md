# Melodify 🎧

Ứng dụng nghe nhạc kiểu Spotify (clone giao diện & tính năng của `open.spotify.com`), xây dựng từ đầu để học:
**React + Vite** ở frontend, **Node.js + Express** ở backend, **Supabase** (Postgres + Auth + Storage) làm cơ sở dữ liệu,
**Google Gemini** cho Danh sách phát AI.

> Đây là dự án học tập. Tên, logo, icon là thiết kế riêng (không dùng tài sản của Spotify). Nhạc thương mại lấy từ
> **Audius** (nền tảng mở, nghệ sĩ tự đăng); podcast lấy từ RSS công khai; thanh toán chỉ là **giả lập**.

---

## Có gì trong app?

| Nhóm | Tính năng |
|---|---|
| Nghe nhạc | Trình phát đầy đủ (phát/dừng/tua/âm lượng, trộn bài, lặp lại), danh sách chờ, lời bài hát chạy theo nhạc, chế độ xem Đang phát, toàn màn hình, trình phát thu nhỏ (Picture-in-Picture), phím tắt |
| Connect | Phát trên nhiều thiết bị/tab, chuyển thiết bị, đồng bộ thời gian thực qua WebSocket |
| Khám phá | Trang chủ cá nhân hoá, Tìm kiếm (gõ sai dấu/thiếu dấu vẫn ra), Duyệt theo thể loại & tâm trạng, trang Nghệ sĩ / Album / Danh sách phát / Bài hát |
| Gợi ý | Daily Mix 1–6, Discover Weekly, Release Radar, On Repeat, mix theo nghệ sĩ/thể loại/thập niên/tâm trạng, Radio, Tự động phát, mục "Đề xuất" trong playlist |
| Premium | Smart Shuffle, **Mix** (chuyển bài kiểu DJ: blend/rise/melt…), Danh sách phát AI, không quảng cáo, bỏ qua không giới hạn |
| Free | Có quảng cáo âm thanh sau mỗi 3 bài (hoặc 15 phút), giới hạn bỏ qua trên di động |
| Thư viện | Lưu bài/album/nghệ sĩ/playlist/podcast, thư mục, ghim, sắp xếp, lọc, chế độ xem lưới/danh sách |
| Podcast | Trang chương trình, trang tập, "Tập của bạn", đánh dấu đã nghe, nhớ vị trí nghe dở |
| Xã hội | Hồ sơ công khai, theo dõi người dùng, Hoạt động nghe của bạn bè, "Có gì mới", "Gần đây" |
| **Khác Spotify** | Người dùng **tự tải nhạc lên** (công khai/riêng tư) → tab **Cộng đồng** tách biệt với nhạc thương mại; tự phân tích BPM/tông/năng lượng; báo cáo vi phạm |
| Tài khoản | Đăng ký nhiều bước, đăng nhập email + mật khẩu hoặc mã 6 số, quên mật khẩu, trang Premium, thanh toán (thẻ thử, OTP 3-D Secure), trang Tài khoản, Cài đặt |
| Khác | Song ngữ Tiếng Việt / English, cài đặt như ứng dụng (PWA) |

## Chạy thử ngay (không cần Supabase)

Máy cần **Node.js 22+**. Trong thư mục dự án:

```bash
npm install          # lần đầu
npm run dev:local    # bật DB cục bộ + giả lập Storage + backend + frontend
```

Mở <http://localhost:5173>. Chế độ này dùng **PGlite** (Postgres chạy ngay trong Node, dữ liệu lưu ở `be/.cache/pglite`)
và tự đăng nhập bằng tài khoản thử "HDK". Chi tiết: [docs/03-chay-du-an.md](docs/03-chay-du-an.md).

## Chạy với Supabase thật

1. Làm theo [docs/02-cai-dat-supabase-va-gemini.md](docs/02-cai-dat-supabase-va-gemini.md) để điền `be/.env`.
2. Tạo bảng + nạp dữ liệu (chỉ lần đầu):
   ```bash
   npm run db:migrate
   npm run import:audius -- --stage=load     # nạp nhạc từ bộ nhớ đệm be/.cache (bỏ --stage=load để tải mới)
   npm run db:seed
   npm run import:podcasts -- --stage=load
   ```
3. `npm run dev` → mở <http://localhost:5173> và đăng ký tài khoản.

## Lệnh hay dùng

| Lệnh | Việc nó làm |
|---|---|
| `npm run dev` | Backend (cổng 4000) + frontend (cổng 5173) với Supabase thật |
| `npm run dev:local` | Như trên nhưng dùng DB cục bộ (offline) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript cho cả `be` và `fe` |
| `npm test` | Unit test (Vitest) |
| `npm run db:check -w be` | Chạy toàn bộ migration trên một Postgres tạm trong RAM + kiểm tra nhanh |
| `npm run build` | Build production |

## Cấu trúc thư mục

```
Spotify Clone/
├─ be/                         ← BACKEND: toàn bộ logic nghiệp vụ
│  ├─ src/
│  │  ├─ contracts/            ← "Hợp đồng" kiểu dữ liệu API (fe import type từ đây)
│  │  ├─ config/env.ts         ← Đọc & kiểm tra biến môi trường
│  │  ├─ db/client.ts          ← Kết nối Postgres
│  │  ├─ lib/                  ← Tiện ích dùng chung (lỗi HTTP, màu ảnh, FFT…)
│  │  ├─ modules/              ← Mỗi nghiệp vụ một thư mục: routes.ts (HTTP) + service.ts (logic)
│  │  │  ├─ auth  users  billing  catalog  playlists  library  search  browse
│  │  │  ├─ player (trình phát phía server)  realtime (WebSocket)
│  │  │  ├─ reco (gợi ý)  music (shuffle, Mix, phân tích âm thanh)  lyrics
│  │  │  ├─ uploads  social  podcasts  ai  media
│  │  ├─ providers/            ← Nguồn nhạc (Audius, nhạc người dùng tải lên…)
│  │  └─ scripts/              ← migrate, seed, import, DB cục bộ…
│  └─ supabase/migrations/     ← Lược đồ CSDL (SQL), chạy theo thứ tự tên file
├─ fe/                         ← FRONTEND: chỉ giao diện
│  └─ src/
│     ├─ api/                  ← Hook gọi API (TanStack Query)
│     ├─ app/                  ← Router, khởi động
│     ├─ components/           ← Thành phần dùng lại (thẻ, danh sách bài, menu, form…)
│     ├─ layout/               ← Khung app: thanh trên, thư viện, trình phát, bảng bên phải
│     ├─ pages/                ← Mỗi trang một thư mục
│     ├─ player/               ← Bộ máy âm thanh (Web Audio), đồng bộ với server
│     ├─ i18n/                 ← Từ điển vi/en
│     └─ styles/               ← Design tokens & CSS chung
└─ docs/                       ← Tài liệu (đọc theo số thứ tự)
```

## Tài liệu

1. [Kiến trúc tổng thể](docs/01-kien-truc.md) — fe/be chia việc thế nào, một lần bấm "Phát" đi qua những đâu
2. [Cài đặt Supabase & Gemini](docs/02-cai-dat-supabase-va-gemini.md)
3. [Chạy dự án, kiểm thử, xử lý lỗi thường gặp](docs/03-chay-du-an.md)
4. [Cơ sở dữ liệu](docs/04-co-so-du-lieu.md)
5. [Thuật toán: gợi ý, trộn bài, Mix, phân tích âm thanh, AI](docs/05-thuat-toan.md)
6. [Lộ trình đọc code & bài tập cho người mới](docs/06-lo-trinh-hoc.md)

## Nguyên tắc quan trọng

- **Không bao giờ** commit/dán `be/.env` (chứa khoá bí mật). `.gitignore` đã chặn sẵn.
- Khoá `SUPABASE_SECRET_KEY` (service role) **chỉ** nằm ở backend — trình duyệt không bao giờ thấy nó.
- Frontend không chứa logic nghiệp vụ: mọi quy tắc (giá, quảng cáo, quyền, gợi ý…) nằm ở backend để sau này
  app di động dùng lại y nguyên.

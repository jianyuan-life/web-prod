// v5.3.35：Route-level loading 覆蓋 root app/loading.tsx
// 避免 root loading.tsx 在 body 級別注入 Suspense streaming，
// 讓 <div hidden id="S:x"> 的 RSC streaming chunks 不會因為
// React 對 body 做 diff 時誤清而引發 $RS parentNode null 崩潰。
//
// 原因：
// 1. app/loading.tsx 會自動用 <Suspense fallback={<Loading/>}> 包整個 route
//    對於 async page.tsx（~2000 行、377KB HTML），這個 Suspense boundary
//    落在 body 直接 children 層，Next.js 的 streaming script 會在 body
//    末尾注入 <div hidden id="S:x">{content}</div> + $RS() 把內容搬到正確位置。
// 2. React 19 hydrate body 時，看到 body 有 Next.js 自己塞的 <div hidden>
//    但 RootLayout 的 JSX 樹裡沒這些，就把它們當 extra children 清掉。
// 3. 清掉後，後面執行的 $RS("S:x","P:x") 找不到 S:x（已被 React 移除），
//    a.parentNode 變 null → TypeError Cannot read properties of null。
// 4. React error #418 (「Unexpected string」) 在同一批 chunks 裡也觸發，
//    因為 streaming 過程中 template 和 placeholder 位置被搞亂。
//
// 修復：
// - 提供 route-level loading.tsx 返回 null，讓 Next.js 使用它而不是 root loading。
// - 因為這個 loading 是 null，Next.js 不會在 body 級別包 Suspense fallback。
// - 改為讓 page 本身在 SSR 時完整阻塞（await data）後一次 flush，
//   body 的 children 數量 server = client，React 不會清 streaming content。
//
// 若 page 還有其他非頂層 Suspense（例如 metadata async），Next.js 會為
// 它們建立較小的 Suspense boundary，影響範圍可控。
export default function Loading() {
  return null
}

// ============================================================
// auth-guard.js — 共用登入守門員模組
// 用法：在每個「需要登入才能看」的頁面加上：
//
//   <script type="module">
//     import { requireAuth } from './auth-guard.js';
//     requireAuth((user) => {
//       // 通過驗證後才會執行這裡，user 是登入的使用者物件
//       document.getElementById('who').textContent = user.displayName;
//     });
//   </script>
//
// 未登入或未通過審核 → 自動跳回 login.html，並記住原本要去的頁面
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ★★★ 與 login.html 使用「同一份」Firebase 設定 ★★★
const firebaseConfig = {
    apiKey: "AIzaSyA_er0I9K3yMwFvkYNLNow4tPEAG7PAl50",
    authDomain: "member-login-5c129.firebaseapp.com",
    projectId: "member-login-5c129",
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);  // 匯出 db，讓受保護頁面共用同一個連線

// 登入頁的位置（依你的實際路徑調整）
const LOGIN_PAGE = 'login.html';

/**
 * 保護目前頁面：驗證「已登入 + 已通過審核」
 * @param {function} onReady - 驗證通過後的回呼，參數為 user 物件
 */
export function requireAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && snap.data().approved === true) {
        // 驗證通過 → 顯示頁面內容
        document.documentElement.style.visibility = 'visible';
        onReady(user);
      } else {
        await signOut(auth);
        redirectToLogin();
      }
    } catch (e) {
      console.error('auth-guard 檢查失敗：', e);
      redirectToLogin();
    }
  });
}

/**
 * 保護「僅管理員」頁面：驗證「已登入 + 已審核 + 是管理員」
 * 非管理員（但已登入）→ 導回會員首頁 member.html
 * @param {function} onReady - 驗證通過後的回呼，參數為 user 物件
 */
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }
    try {
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      if (!(uSnap.exists() && uSnap.data().approved === true)) {
        await signOut(auth);
        redirectToLogin();
        return;
      }
      const aSnap = await getDoc(doc(db, 'admins', user.uid));
      if (!aSnap.exists()) {
        // 已登入但不是管理員 → 送回會員首頁，不讓他停在管理頁
        location.href = 'member.html';
        return;
      }
      document.documentElement.style.visibility = 'visible';
      onReady(user);
    } catch (e) {
      console.error('requireAdmin 檢查失敗：', e);
      location.href = 'member.html';
    }
  });
}

/**
 * 查目前登入者是不是管理員（給一般頁面決定要不要顯示「管理員區」連結）
 * @param {object} user - requireAuth 回傳的 user
 * @returns {Promise<boolean>}
 */
export async function isAdmin(user) {
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (e) {
    return false;
  }
}

/** 登出並回登入頁（給頁面上的登出按鈕用） */
export async function logout() {
  await signOut(auth);
  location.href = LOGIN_PAGE;
}

/** 跳回登入頁，並用 redirect 參數記住原本要去的頁面 */
function redirectToLogin() {
  const here = encodeURIComponent(location.pathname.split('/').pop() + location.search);
  location.href = LOGIN_PAGE + '?redirect=' + here;
}

// 防止內容在驗證完成前先閃現：先隱藏整頁，驗證通過才顯示
document.documentElement.style.visibility = 'hidden';

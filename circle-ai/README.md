# Circle AI — Google Lens Desktop for Linux (GNOME / Wayland)

מערכת שולחן עבודה מתקדמת ל-Linux (Ubuntu / GNOME / Wayland) המביאה את חוויית **Circle to Search / Google Lens Overlay** המקורית משולבת בתוך שולחן העבודה בלחיצה אחת.

---

## 🚀 תכונות עיקריות (Key Features)

* **100% Google Lens מקורי (Chrome Lens Overlay):**
  * **תג עליון צף (Badge Pill):** תגית לבנה מעוגלת במרכז המסך עם אייקון Google Lens.
  * **בועית הדרכה (Center Tooltip):** תגית `צריך לגרור כדי לחפש` הנעלמת מיד עם תחילת הסימון.
  * **מסגרת מונפשת (Rainbow Border Animation):** הילה זוהרת בצבעי הקשת המונפשת סביב אזור הסימון עם פינות זוויתיות לבנות (Corner Brackets).
  * **תפריט צף מתחת לסימון (Selection Context Menu):** תפריט קופץ עם אפשרויות ל-**העתקת הטקסט**, **תרגום** ו-**העתקת התמונה**.
* **חלונית תוצאות צדה צפה (Floating Side Panel):**
  * טעינה מידית של תוצאות החיפוש הויזואליות, כרטיסיית **מצב AI**, התאמות מדויקות והתאמות ויזואליות בחלונית צדדית צפה.
* **הפעלה מהירה בלחיצה אחת:**
  * **אייקון צבעוני ב-Top Bar של GNOME:** לחיצה ישירה על האייקון בסרגל העליון מפעילה את הסימון מיד.
  * **קיצור מקלדת גלובלי:** `Super+Space`.
  * **הפעלה אוטומטית בהדלקת המחשב (Autostart).**

---

## 🛠️ טכנולוגיות ורכיבים (Technologies & Architecture)

### 1. GNOME Shell Extension (GJS & C APIs)

* **נתיב:** `gnome-extension/extension.js`
* **תפקיד:** עוקף את מגבלות האבטחה של GNOME 45+ ב-Wayland (שמונעות מאפליקציות חיצוניות לצלם מסך ללא אישור בכל פעם).
* **שימוש ב-APIs:**
  * `gi://Shell` — שימוש ישיר ב-`Shell.Screenshot` ליצירת צילום מסך סטטי מידי ברמת הקומפוזיטור.
  * `gi://St` & `gi://PanelMenu` — הזרקת כפתור צבעוני לסרגל העליון (Top Bar).

### 2. פרוטוקול תקשורת D-Bus (`gdbus`)

* הרחבת ה-GNOME מייצאת אובייקט בנתיב `/io/github/avivderi/CircleAI` על גבי ה-Session Bus.
* Electron מאזינה לאות `TriggerCapture` באמצעות `gdbus monitor` ומפעילה את תהליך ה-Overlay בשבריר שנייה.

### 3. Electron & Node.js Core

* **תהליך מרכזי (`src/main.js`):** מנהל את חלונית ה-Overlay בגודל מלא (`fullscreen`, `alwaysOnTop`) ואת חלונית התוצאות הצפה.
* **עיבוד תמונה (`sharp`):** חיתוך מדויק של האזור המסומן (Rectangle / Mask Polygon) ברמת פיקסלים גבוהה.

### 4. אינטגרציה ישירה מול API העלאות Google Lens

* **נתיב:** `uploadToGoogleLens(imagePath)`
* **איך זה עובד:**
  1. שילוח בקשת `HTTP POST` עם `multipart/form-data` המכילה את הפיקסלים של התמונה המסומנת ל-`https://lens.google.com/v3/upload`.
  2. גוגל מחזירה תגובת `303 See Other` עם ה-URL המלא והישיר של תוצאות החיפוש (כולל מזהה סשן `vsrid`).
  3. חלון התוצאות טוען את ה-URL הזה מידית ומציג את התוצאות המלאות מ-Google Lens ללא שום הזרקות DOM עקיפות.

---

## 📁 מבנה הפרויקט (Project Structure)

```text
circle-ai/
├── gnome-extension/            # הרחבת GNOME Shell המקורית
│   ├── extension.js            # לוגיקת GJS, הזרקת Top Bar וצילום מסך C-API
│   └── metadata.json           # הגדרות Extension עבור GNOME Shell 45–50
├── src/
│   ├── main.js                 # התהליך המרכזי של Electron (D-Bus, Windows, Lens API)
│   ├── capture/
│   │   └── screenshot.js       # ניהול תקשורת D-Bus וצילום המסך
│   ├── crop/
│   │   └── mask-crop.js        # חיתוך תמונות לפי קואורדינטות ב-sharp
│   └── overlay/
│       ├── overlay.html        # ממשק הסימון (Top Badge, Context Menu, Canvas)
│       └── overlay-renderer.js # הניפוש הויזואלי (Rainbow animation, Mouse handlers)
├── assets/
│   └── tray-icon.png           # אייקון Google Lens הרשמי
├── install-extension.sh        # סקריפט התקנה אוטומטי להרחבת GNOME
└── README.md                   # קובץ תיעוד זה
```

---

## 🔧 התקנה והרצה (Installation & Setup)

### 1. התקנת הרחבת GNOME

```bash
./install-extension.sh
```

*לאחר ההתקנה הראשונית יש לבצע **Log out ו-Log in** מחדש למשתמש כדי ש-Wayland יטען את ה-Extension.*

### 2. התקנת תלויות והרצת האפליקציה

```bash
npm install
npm start
```

### 3. קישוריות והפעלה אוטומטית (Autostart)

האפליקציה יוצרת אוטומטית קובץ אוטוסטארט בנתיב:
`~/.config/autostart/circle-ai.desktop`
מנגנון זה מבטיח שהאפליקציה תרוץ ברקע באופן אוטומטי עם הדלקת המחשב.

---

## ⌨️ קיצורי דרך ושימוש

* **לחיצה עכבר:** לחיצה אחת על אייקון Google Lens ב-Top Bar העליון.
* **מקלדת:** הקשה על `Super + Space`.
* **ביטול:** מקש `ESC` בזמן שהמסך מוקפא.

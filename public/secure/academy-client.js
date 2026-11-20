(() => {
  var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

  // aplus-preview/extensions/navigation.js
  var require_navigation = __commonJS(function(exports, module) {
    var sections = [
      { key: "workspace", en: "Workspace", ar: "مساحة العمل", routes: ["Dashboard", "Daily Desk"], pages: ["overview", "notifications"] },
      { key: "schedule", en: "Scheduling", ar: "المواعيد والجدولة", routes: ["Timetable", "Scheduling", "My Schedule"], pages: ["schedule", "requests"] },
      { key: "academy", en: "Academy", ar: "الأكاديمية", routes: ["Students", "Teachers", "Subjects", "Lessons", "Recorded Courses", "Projects", "My Subjects", "My Projects", "Delivery"], pages: ["subjects", "lessons", "courses", "projects", "education", "withdrawals"] },
      { key: "finance", en: "Finance", ar: "المالية", routes: ["Payments", "Batch Payments", "Treasury", "Reports", "Cash Flow", "Billing", "Financial Summary"], pages: ["student-statement", "teacher-statement", "plans"] },
      { key: "operations", en: "Operations", ar: "التشغيل والمتابعة", routes: ["Registrations", "Attendance & Notes", "Follow-up Tasks"], pages: [] },
      { key: "administration", en: "Administration", ar: "الإدارة", routes: ["Teacher Preview", "Team", "Settings"], pages: ["accounts", "audit"] }
    ];
    var paths = { grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z", calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4", book: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1z M12 5v15", file: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7", bell: "M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3z M10 21h4", users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3", check: "M4 4h16v16H4z M8 12l3 3 5-6" };
    var icons = { overview: "grid", notifications: "bell", schedule: "calendar", requests: "check", subjects: "book", lessons: "book", courses: "book", projects: "file", education: "book", "student-statement": "file", "teacher-statement": "file", plans: "calendar", accounts: "users", audit: "file", withdrawals: "book" };
    var icon = (key) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + paths[icons[key] || "file"] + '"/></svg>';
    function integrate(scroll, pages, { lang = "en", active = null } = {}) {
      if (!scroll)
        return;
      const signature = JSON.stringify([lang, active, pages.map((p) => p[0])]);
      if (scroll.dataset.portalNavigation === signature)
        return;
      const native = [...scroll.querySelectorAll("a[data-route]")], existing = new Map([...scroll.querySelectorAll("a[data-extension]")].map((a) => [a.dataset.extension, a]));
      const extensions = pages.map(([key, en, ar]) => {
        const a = existing.get(key) || document.createElement("a");
        a.href = "#preview-" + key;
        a.dataset.extension = key;
        a.title = lang === "ar" ? ar : en;
        a.setAttribute("aria-label", a.title);
        a.innerHTML = icon(key) + '<span class="ui-nav-text">' + (lang === "ar" ? ar : en) + "</span>";
        a.classList.toggle("on", key === active);
        if (key === active)
          a.setAttribute("aria-current", "page");
        else
          a.removeAttribute("aria-current");
        return a;
      });
      const known = new Set;
      scroll.replaceChildren();
      for (const section of sections) {
        const links = [...native.filter((a) => section.routes.includes(a.dataset.route)), ...extensions.filter((a) => section.pages.includes(a.dataset.extension))];
        if (!links.length)
          continue;
        const group = document.createElement("div");
        group.className = "ui-nav-group";
        group.dataset.navSection = section.key;
        const label = document.createElement("div");
        label.className = "ui-nav-label";
        label.textContent = lang === "ar" ? section.ar : section.en;
        group.append(label);
        for (const a of links) {
          if (active && a.dataset.route) {
            a.classList.remove("on");
            a.removeAttribute("aria-current");
          }
          group.append(a);
          known.add(a);
        }
        scroll.append(group);
      }
      const unknown = [...native, ...extensions].filter((a) => !known.has(a));
      if (unknown.length) {
        const group = document.createElement("div");
        group.className = "ui-nav-group";
        group.dataset.navSection = "other";
        for (const a of unknown)
          group.append(a);
        scroll.append(group);
      }
      scroll.dataset.portalNavigation = signature;
    }
    function groupFor(page) {
      return sections.find((s) => s.pages.includes(page));
    }
    module.exports = { integrate, groupFor, icon };
  });

  // aplus-preview/extensions/timezones.js
  var require_timezones = __commonJS(function(exports, module) {
    var ACADEMY = "Africa/Cairo";
    var ZONES = [{ id: "Africa/Cairo", en: "Egypt — Cairo", ar: "مصر — القاهرة" }, { id: "Asia/Kuwait", en: "Kuwait", ar: "الكويت" }, { id: "Europe/London", en: "United Kingdom — London", ar: "بريطانيا — لندن" }];
    var formatters = new Map;
    var fail = (message) => {
      throw Object.assign(Error(message), { code: 422 });
    };
    var valid = (zone) => ZONES.some((z) => z.id === zone);
    function parts(ms, zone) {
      if (!valid(zone))
        fail("Choose Egypt, Kuwait or the United Kingdom.");
      if (!formatters.has(zone))
        formatters.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
      const p = Object.fromEntries(formatters.get(zone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
    }
    function wall(date, time, zone) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
        fail("Choose a valid date and time.");
      const base = Date.parse(date + "T" + time + ":00Z");
      if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== date)
        fail("Choose a valid date and time.");
      const offsets = new Set;
      for (let hours = -36;hours <= 36; hours += 6) {
        const sample = base + hours * 3600000, p = parts(sample, zone);
        offsets.add(Date.parse(p.date + "T" + p.time + ":00Z") - sample);
      }
      const candidates = [...offsets].map((offset) => base - offset).filter((ms) => {
        const p = parts(ms, zone);
        return p.date === date && p.time === time;
      });
      if (!candidates.length)
        fail("This local time does not exist because of a daylight-saving change. Choose another time.");
      if (candidates.length > 1)
        fail("This local time occurs twice because of a daylight-saving change. Choose another time.");
      return candidates[0];
    }
    function convert(date, time, from, to) {
      return parts(wall(date, time, from), to);
    }
    function display(row, zone) {
      try {
        const start = convert(row.date, row.startsAt, ACADEMY, zone), end = convert(row.date, row.endsAt, ACADEMY, zone);
        return { ...row, displayDate: start.date, displayStart: start.time, displayEndDate: end.date, displayEnd: end.time, displayTimezone: zone };
      } catch (error) {
        return { ...row, displayDate: null, displayStart: null, displayEndDate: null, displayEnd: null, displayTimezone: zone, timeIssue: error.message };
      }
    }
    function proposal(input, zone) {
      if (!valid(zone))
        fail("Choose Egypt, Kuwait or the United Kingdom.");
      const start = wall(input.date, input.starts_at, zone), end = wall(input.end_date || input.date, input.ends_at, zone);
      if (end <= start)
        fail("The requested end must follow the requested start.");
      const a = parts(start, ACADEMY), b = parts(end, ACADEMY);
      if (a.date !== b.date || b.time <= a.time)
        fail("The requested lesson must fit within one academy day.");
      return { date: a.date, starts_at: a.time, ends_at: b.time };
    }
    function preference(db, id) {
      const row = db.prepare("SELECT timezone FROM preview_student_preferences WHERE student_id=?").get(id);
      return row && valid(row.timezone) ? row.timezone : ACADEMY;
    }
    module.exports = { ACADEMY, ZONES, valid, parts, wall, convert, display, proposal, preference };
  });

  // aplus-preview/runtime/shims/fs.js
  var require_fs = __commonJS(function(exports, module) {
    module.exports = { readFileSync: () => `/* Shared presentation for every portal/staff extension; no business-state changes. */
#extension-view{color:var(--ink);letter-spacing:0;min-width:0;max-width:1400px;margin-inline:auto}
#extension-view .extension-heading{margin-block-end:24px}
#extension-view .extension-eyebrow{color:var(--mut);font-size:12px;margin:0 0 6px}
#extension-view .extension-heading h2{margin:0;font-size:26px;letter-spacing:-.025em;line-height:1.3}
#extension-view .extension-description{color:var(--mut);margin:8px 0 0;max-width:850px;line-height:1.7}
#extension-view>h3,#extension-statement>h3{margin-block:24px 12px}
#extension-view .tw{width:100%;max-width:100%;overflow:auto;border:1px solid var(--bd);border-radius:12px;background:var(--card);margin-block:14px 24px}
#extension-view table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
#extension-view th{background:var(--soft);color:var(--mut);font-size:12px;font-weight:600;text-align:start;padding:12px 16px;white-space:nowrap}
#extension-view td{padding:13px 16px;border-bottom:1px solid var(--bd);overflow-wrap:anywhere;vertical-align:middle;line-height:1.6}
#extension-view tbody tr:last-child td{border-bottom:0}
#extension-view tbody tr:hover td{background:var(--soft)}
#extension-view .extension-empty{text-align:center;color:var(--mut);padding:36px 16px}
#extension-view form{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:22px;margin:18px 0 26px;min-width:0}
#extension-view td form{min-width:230px;padding:14px;margin:12px 0 0}
#extension-view label{display:flex;flex-direction:column;gap:8px;font-weight:500;color:var(--ink);font-size:13px;min-width:0}
#extension-view .fg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:0 0 20px}
#extension-view input,#extension-view select,#extension-view textarea{width:100%;max-width:100%;min-height:42px;background:var(--card);color:var(--ink);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;box-sizing:border-box}
#extension-view input[type=checkbox]{width:17px;height:17px;min-height:17px;padding:0;flex:0 0 auto;accent-color:var(--acc)}
#extension-view #extension-reschedule-group{flex-direction:row;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;background:var(--soft);font-weight:400;line-height:1.6;margin-block:4px 18px}
#extension-view .extension-controls{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-block-end:20px}
#extension-view .extension-controls label{flex:1 1 160px}
#extension-view .extension-controls>select{flex:1 1 220px;width:auto;min-height:42px}
#extension-view button{min-height:38px;border-radius:8px}
#extension-view button:disabled{opacity:.55;cursor:default}
#extension-view input:focus-visible,#extension-view select:focus-visible,#extension-view textarea:focus-visible,#extension-view button:focus-visible{outline:3px solid var(--baby);outline-offset:2px;border-color:var(--acc)}
#extension-view [aria-invalid=true]{border-color:var(--bad)}
.extension-feedback{padding:12px 14px;border-radius:8px;line-height:1.7;margin:12px 0;border:1px solid var(--bd);background:var(--soft);color:var(--ink);scroll-margin-block-end:140px}
.extension-feedback[data-kind=error]{border-color:var(--bad);color:var(--bad)}
.extension-feedback[data-kind=success]{border-color:var(--good);color:var(--good)}
.extension-feedback:empty{display:none}
#extension-view bdi{font-variant-numeric:tabular-nums}
#extension-view .extension-timezone-settings{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:16px 20px;background:var(--card);border:1px solid var(--bd);border-radius:12px;margin-block:16px}
#extension-view .extension-timezone-settings label{flex:1 1 230px}
#extension-view .extension-timezone-settings p{flex:2 1 300px;margin:0;color:var(--mut);line-height:1.7}
#extension-view td .b2{margin:2px}
#extension-view .extension-form-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
#nv [data-extension]{display:flex;align-items:center;gap:10px}
#nv [data-extension] svg{width:18px;height:18px;flex:0 0 18px}
@media(max-width:640px){#extension-view .fg{grid-template-columns:1fr}#extension-view form{padding:16px}#extension-view .extension-heading h2{font-size:23px}#extension-view th,#extension-view td{padding:11px 12px}#extension-view .extension-controls>*{width:100%}#extension-view .extension-controls button{flex:1 1 140px}}
@media print{#extension-view .extension-heading{margin-bottom:16px}#extension-view .tw{overflow:visible;break-inside:auto}#extension-view tbody tr:hover td{background:transparent}.extension-feedback{display:none!important}}
` };
  });

  // aplus-preview/extensions/course-withdrawal-ui.js
  var require_course_withdrawal_ui = __commonJS(function(exports, module) {
    function mount(user) {
      if (!["Admin", "Coordinator", "Accountant"].includes(user.role))
        return;
      const tr = (en, ar) => document.documentElement.lang === "ar" ? ar : en, esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), money = (n, c) => '<bdi dir="ltr">' + (n / 1000).toFixed(3) + " " + esc(c) + "</bdi>";
      const api = (path, body) => {
        const r = window.__APLUS_TRANSPORT__.dispatch(body ? "POST" : "GET", "/api/preview/course-settlement" + path, body ? { "content-type": "application/json", "x-aplus-token": document.querySelector("meta[name=aplus-token]").content } : {}, body ? JSON.stringify(body) : undefined), data = JSON.parse(r.text());
        if (!data.ok)
          throw Error(data.error);
        return data;
      };
      const translated = (message) => ({
        "Insufficient account balance.": tr("Insufficient account balance. Choose a funded treasury account.", "رصيد الخزينة غير كافٍ. اختر خزينة بها رصيد."),
        "This operation would create a negative historical balance.": tr("This operation would create a negative historical balance.", "العملية ستجعل رصيد الخزينة سالبًا في تاريخ سابق."),
        "Data changed. Reopen the withdrawal before confirming.": tr("Data changed. Close and reopen this form before confirming.", "البيانات اتغيرت. اقفل النموذج وافتحه من جديد قبل التأكيد."),
        "Refund exceeds the available paid amount.": tr("Refund exceeds the available paid amount.", "المبلغ المرتجع أكبر من صافي المدفوع المتاح."),
        "The retained amount cannot exceed the course fee. Increase the refund.": tr("The retained amount cannot exceed the course fee. Increase the refund.", "المبلغ المحتفظ به يتجاوز رسوم الاشتراك. زوّد المبلغ المرتجع."),
        "Enter a withdrawal reason.": tr("Enter a withdrawal reason.", "اكتب سبب الانسحاب."),
        "Choose a date after enrollment and all related payments, no later than today.": tr("Choose a date after enrollment and all related payments, no later than today.", "اختر تاريخًا من آخر حركة مالية مرتبطة بالاشتراك وحتى اليوم."),
        "Choose the refund method and a matching treasury account.": tr("Choose the refund method and a matching treasury account.", "اختر طريقة الرد وخزينة بنفس العملة."),
        "The account period is reconciled and closed. Use a later open date.": tr("The account period is reconciled and closed. Use a later open date.", "الفترة المالية للخزينة مقفلة. اختر تاريخًا في فترة مفتوحة.")
      })[message] || message;
      const note = (el, msg) => {
        el.hidden = false;
        el.textContent = translated(msg);
        el.focus?.();
      };
      function open(id) {
        document.getElementById("course-withdraw-dialog")?.remove();
        let q;
        try {
          q = api("?enrollment=" + id);
        } catch (e) {
          const message = document.createElement("p");
          message.className = "neg";
          message.setAttribute("role", "alert");
          message.textContent = translated(e.message);
          document.getElementById("v")?.prepend(message);
          return;
        }
        const dialog = document.createElement("dialog");
        dialog.id = "course-withdraw-dialog";
        dialog.setAttribute("aria-labelledby", "course-withdraw-title");
        dialog.innerHTML = "<header><div><small>" + esc(q.course) + '</small><h2 id="course-withdraw-title">' + tr("Withdrawal and refund", "انسحاب ورد مدفوعات") + "</h2><p>" + esc(q.student) + '</p></div><button type="button" class="b2" data-close aria-label="' + tr("Close", "إغلاق") + '">×</button></header>' + (q.settlement ? '<p role="status">' + tr("This withdrawal has already been settled.", "تمت تسوية انسحاب هذا الاشتراك بالفعل.") + "</p><p>" + tr("Refund", "المبلغ المرتجع") + ": " + money(q.settlement.refund, q.currency) + " · " + tr("Fee waived", "الرسوم الملغاة") + ": " + money(q.settlement.waived, q.currency) + "</p>" : '<form id="course-withdraw-form"><p>' + tr("Admin executes this entire operation directly. No coordinator or accountant approval is required.", "الـAdmin ينفّذ العملية بالكامل مباشرة، دون موافقة المنسق أو المحاسب.") + '</p><div class="course-withdraw-grid"><label>' + tr("Refund amount", "المبلغ المرتجع") + " (" + esc(q.currency) + ')<input name="refund" type="number" min="0" max="' + q.paid / 1000 + '" step="0.001" value="' + q.paid / 1000 + '" required></label><label>' + tr("Withdrawal and payout date", "تاريخ الانسحاب ورد المبلغ") + '<input name="date" type="date" min="' + esc(q.earliestDate) + '" max="' + q.today + '" value="' + q.today + '" required></label><label data-payout>' + tr("Refund method", "طريقة رد المبلغ") + '<select name="method"><option value="Cash">' + tr("Cash", "نقدًا") + '</option><option value="Bank transfer">' + tr("Bank transfer", "تحويل بنكي") + '</option><option value="Wallet">' + tr("Wallet", "محفظة إلكترونية") + "</option></select></label><label data-payout>" + tr("Payout treasury", "خزينة الصرف") + '<select name="account_id"><option value="">' + tr("Choose a matching account", "اختر خزينة بنفس العملة") + "</option>" + q.accounts.map((a) => '<option value="' + a.id + '">' + esc(a.name) + " · " + (a.balance / 1000).toFixed(3) + " " + esc(a.currency) + "</option>").join("") + '</select></label><label class="course-withdraw-wide">' + tr("Withdrawal reason, visible to the student", "سبب الانسحاب، يظهر للطالب") + '<textarea name="reason" maxlength="500" minlength="3" required></textarea></label></div><div id="course-withdraw-preview" aria-live="polite"></div><p>' + tr("Original receipts remain in history. Cancelled installments remain visible as cancelled. Earlier teacher payments are preserved; an excess payment may appear as teacher credit.", "الإيصالات الأصلية محفوظة، والأقساط تبقى في السجل بحالة ملغاة. دفعات المدرس السابقة لا تُحذف؛ وقد يظهر رصيد مدفوع زائد له بعد تعديل المستحق.") + "</p><p>" + tr("Partial refunds retain the difference as the final agreed course fee. No new amount remains due from this enrollment.", "عند الرد الجزئي، يُحتفظ بالفرق كرسوم نهائية متفق عليها للكورس. لا يتبقى مبلغ جديد للتحصيل على هذا الاشتراك.") + '</p><div id="course-withdraw-account-note" hidden>' + tr("No matching treasury account exists. Create or fund one under Treasury before refunding.", "لا توجد خزينة مناسبة. أضف خزينة أو موّلها من صفحة الخزائن قبل رد المبلغ.") + ' <button class="b2" type="button" data-treasury>' + tr("Open treasury", "فتح الخزائن") + '</button></div><label class="course-withdraw-confirm"><input type="checkbox" name="confirm" required>' + tr("I confirm withdrawal, fee cancellation, the recorded payout and the displayed effect on teacher entitlement.", "أؤكد الانسحاب وإلغاء الرسوم وتسجيل رد المبلغ والأثر الموضح على مستحق المدرس.") + '</label><p id="course-withdraw-error" class="neg" role="alert" tabindex="-1" hidden></p><footer><button class="b2" type="button" data-close>' + tr("Cancel", "إلغاء") + '</button><button class="b" type="submit" ' + (q.blocked ? "disabled" : "") + ">" + tr("Confirm withdrawal and settlement", "تأكيد الانسحاب والتسوية") + "</button></footer></form>");
        document.body.append(dialog);
        dialog.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => dialog.remove());
        dialog.querySelector("[data-treasury]")?.addEventListener("click", () => {
          dialog.remove();
          document.querySelector('#nv [data-route="Treasury"]')?.click();
        });
        if (dialog.showModal)
          dialog.showModal();
        else
          dialog.setAttribute("open", "");
        const form = dialog.querySelector("form");
        if (!form)
          return;
        const error = dialog.querySelector("#course-withdraw-error"), preview = dialog.querySelector("#course-withdraw-preview"), button = form.querySelector("[type=submit]"), key = crypto.randomUUID();
        let done = false;
        const parse = () => {
          const s = form.elements.refund.value;
          if (!/^\d+(\.\d{1,3})?$/.test(s))
            return null;
          const n = Math.round(Number(s) * 1000);
          return Number.isSafeInteger(n) ? n : null;
        };
        function update() {
          const refund = parse(), valid = refund !== null && refund <= q.paid && refund >= 0, retained = valid ? q.paid - refund : 0, waived = q.price - retained;
          form.querySelectorAll("[data-payout]").forEach((x) => {
            x.hidden = refund === 0;
          });
          form.elements.account_id.required = refund !== 0;
          dialog.querySelector("#course-withdraw-account-note").hidden = refund === 0 || q.accounts.length > 0;
          if (!valid || waived < 0) {
            preview.textContent = tr("Enter a valid refundable amount.", "أدخل مبلغًا صالحًا للرد.");
            button.disabled = true;
            return;
          }
          const rows = [[tr("Original enrollment fee", "رسوم الاشتراك الحالية"), q.price], [tr("Net paid before this operation", "صافي المدفوع قبل العملية"), q.paid], [tr("Refund now", "يُرد الآن"), refund], [tr("Fee cancellation", "الرسوم الملغاة"), waived], [tr("Final retained fee", "الرسوم النهائية المحتفظ بها"), retained], [tr("Enrollment balance after settlement", "المتبقي على الطالب بعد التسوية"), 0], [tr("Course revenue after settlement", "إيراد الكورس بعد التسوية"), q.courseRevenue - waived], [tr("Instructor entitlement before settlement", "مستحق المدرس قبل التسوية"), q.teacherEarned], [tr("Instructor entitlement after settlement", "مستحق المدرس بعد التسوية"), Math.round((q.courseRevenue - waived) * q.share / 100)]];
          preview.innerHTML = "<h3>" + tr("Review before confirming", "مراجعة قبل التأكيد") + "</h3><table><tbody>" + rows.map(([label, n]) => '<tr><th scope="row">' + label + "</th><td>" + money(n, q.currency) + "</td></tr>").join("") + "</tbody></table>";
          button.disabled = !!q.blocked || refund > 0 && q.accounts.length === 0;
        }
        form.elements.refund.oninput = update;
        update();
        if (q.blocked)
          note(error, q.blocked);
        form.onsubmit = async (event) => {
          event.preventDefault();
          if (done || button.disabled)
            return;
          if (!form.reportValidity())
            return;
          button.disabled = true;
          error.hidden = true;
          try {
            const result = api("", { enrollment_id: q.id, quote: q.quote, request_key: key, refund: parse(), date: form.elements.date.value, reason: form.elements.reason.value, method: form.elements.method.value, account_id: Number(form.elements.account_id.value) || null, confirm: form.elements.confirm.checked });
            done = true;
            await window.__APLUS_SAVE__?.();
            window.__APLUS_REFRESH_COURSE__?.(q.courseId);
            form.innerHTML = '<div role="status"><h3>' + tr("Withdrawal and settlement completed", "تم الانسحاب والتسوية بنجاح") + "</h3><p>" + tr("Refund recorded", "تم تسجيل رد مبلغ") + ": " + money(result.refund, q.currency) + "</p><p>" + tr("Fee cancelled", "الرسوم الملغاة") + ": " + money(result.waived, q.currency) + "</p><p>" + tr("Enrollment remaining", "المتبقي على الاشتراك") + ": " + money(0, q.currency) + "</p><p>" + tr("Original receipts and the withdrawal audit trail are preserved.", "الإيصالات الأصلية وسجل عملية الانسحاب محفوظان.") + '</p></div><button class="b" type="button">' + tr("Back to course", "العودة للكورس") + "</button>";
            form.querySelector("button").onclick = () => dialog.remove();
          } catch (e) {
            note(error, e.message);
            button.disabled = false;
          }
        };
      }
      function decorate() {
        for (const edit of document.querySelectorAll('#v button[onclick^="edRE("]')) {
          const match = edit.getAttribute("onclick").match(/^edRE\((\d+)\)/), row = edit.closest("tr");
          if (!match || !row || row.dataset.courseWithdrawalWired)
            continue;
          row.dataset.courseWithdrawalWired = "1";
          try {
            const q = api("?enrollment=" + match[1]);
            if (q.settlement) {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 7) {
                cells[2].innerHTML = money(q.price, q.currency) + '<small style="display:block">' + tr("Before settlement", "قبل التسوية") + ": " + money(q.settlement.original_price, q.currency) + "</small>";
                cells[3].innerHTML = money(q.paid, q.currency);
                cells[4].innerHTML = money(q.remaining, q.currency);
                cells[5].textContent = tr("Withdrawn / settled", "منسحب / تمت التسوية");
                cells[6].replaceChildren();
                for (const payment of document.querySelectorAll('#v button[onclick="edCP(' + q.id + ')"]')) {
                  const label = document.createElement("span");
                  label.textContent = tr("Withdrawn / settled", "منسحب / تمت التسوية");
                  payment.replaceWith(label);
                }
              }
            }
            if (user.role === "Admin") {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "lk";
              b.dataset.courseWithdrawal = match[1];
              b.textContent = q.settlement ? tr("Settlement details", "تفاصيل التسوية") : tr("Withdrawal and refund", "انسحاب ورد مدفوعات");
              b.onclick = () => open(Number(match[1]));
              row.lastElementChild.append(b);
            }
          } catch (e) {
            row.removeAttribute("data-course-withdrawal-wired");
          }
        }
      }
      const css = document.createElement("style");
      css.textContent = "#course-withdraw-dialog{width:min(760px,calc(100vw - 32px));max-height:90vh;overflow:auto;border:1px solid var(--line,#dce3ee);border-radius:16px;padding:24px;background:var(--card,#fff);color:var(--ink,#132440)}#course-withdraw-dialog::backdrop{background:rgba(12,24,44,.45)}#course-withdraw-dialog header,#course-withdraw-dialog footer{display:flex;align-items:start;justify-content:space-between;gap:16px}#course-withdraw-dialog h2{margin:6px 0}#course-withdraw-dialog label{display:flex;flex-direction:column;gap:8px}#course-withdraw-dialog input,#course-withdraw-dialog select,#course-withdraw-dialog textarea{width:100%;box-sizing:border-box}#course-withdraw-dialog textarea{min-height:76px}#course-withdraw-dialog .course-withdraw-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}#course-withdraw-dialog .course-withdraw-wide{grid-column:1/-1}#course-withdraw-dialog table{width:100%;margin:16px 0}#course-withdraw-dialog th{text-align:start;font-weight:500}#course-withdraw-dialog td{text-align:end}#course-withdraw-dialog .course-withdraw-confirm{display:flex;flex-direction:row;align-items:start;margin:20px 0}#course-withdraw-dialog [type=checkbox]{width:auto;margin-top:4px}#course-withdraw-dialog [hidden]{display:none!important}#course-withdraw-dialog footer{margin-top:20px;justify-content:end}@media(max-width:600px){#course-withdraw-dialog{padding:16px}.course-withdraw-grid{grid-template-columns:1fr!important}}";
      document.head.append(css);
      let queued = false;
      new MutationObserver(() => {
        if (queued)
          return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          decorate();
        });
      }).observe(document.getElementById("v"), { childList: true, subtree: true });
      decorate();
      window.__APLUS_COURSE_WITHDRAWAL__ = { open };
    }
    module.exports = { mount };
  });

  // aplus-preview/extensions/ui.js
  var require_ui = __commonJS(function(exports, module) {
    function studentPage(original, token, user) {
      const styles = [...original.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join(`
`);
      return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="aplus-token" content="' + token + '"><title>A+ Hub Academy — Student portal</title>' + styles + '</head><body><div id="app"><nav id="nv"></nav><div id="workspace"><header id="topbar"></header><main id="v" tabindex="-1"></main></div></div><script>window.APLUS_STUDENT=' + JSON.stringify(user).replace(/</g, "\\u003c") + ";</script></body></html>";
    }
    function mount() {
      const user = window.APLUS_STUDENT || window.__APLUS_TRANSPORT__?.dispatch("GET", "/api/auth/status").text() && JSON.parse(window.__APLUS_TRANSPORT__.dispatch("GET", "/api/auth/status").text()).user;
      if (!user)
        return;
      const NAV = require_navigation(), TZ = require_timezones();
      const student = user.role === "Student", financial = ["Admin", "Accountant"].includes(user.role), teacher = user.role === "Teacher";
      const tr = (en, ar) => document.documentElement.lang === "ar" ? ar : en;
      const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      const money = (v, c = "KWD") => v === null || v === undefined ? tr("Incomplete", "غير مكتمل") : (v / 1000).toFixed(3) + " " + c;
      const api = (path, body) => {
        const rt = window.__APLUS_TRANSPORT__, headers = body ? { "content-type": "application/json", "x-aplus-token": document.querySelector('meta[name="aplus-token"]')?.content } : {};
        const r = rt.dispatch(body ? "POST" : "GET", "/api/preview/" + path, headers, body ? JSON.stringify(body) : undefined), data = JSON.parse(r.text());
        if (!data.ok)
          throw new Error(data.error);
        if (body)
          window.__APLUS_SAVE__?.();
        return data;
      };
      const token = () => crypto.randomUUID();
      const button = (id, en, ar, icon = "") => '<button class="b2" type="button" id="' + id + '">' + icon + esc(tr(en, ar)) + "</button>";
      const table = (headers, rows) => '<div class="tw"><table><thead><tr>' + headers.map((x) => '<th scope="col">' + esc(x) + "</th>").join("") + "</tr></thead><tbody>" + (rows.length ? rows.map((r) => "<tr>" + r.map((x) => "<td>" + x + "</td>").join("") + "</tr>").join("") : '<tr><td class="extension-empty" colspan="' + headers.length + '">' + tr("No records", "لا توجد سجلات") + "</td></tr>") + "</tbody></table></div>";
      const text = (v) => "<span data-ui-user-content>" + esc(v) + "</span>";
      const link = (u) => {
        try {
          if (new URL(u).protocol !== "https:")
            return "";
        } catch (_) {
          return "";
        }
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + tr("Open link", "فتح الرابط") + "</a>";
      };
      const field = (name, en, ar, type = "text", value = "") => "<label>" + esc(tr(en, ar)) + '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '" ' + (type === "password" ? 'autocomplete="new-password"' : "") + "></label>";
      let page = "overview", data = null, directory = null, selection = "", from = "", to = "", statement = null, extensionActive = student;
      const pages = student ? [["overview", "Overview", "نظرة عامة"], ["subjects", "My Subjects", "موادي"], ["schedule", "My Schedule", "جدولي"], ["requests", "My Change Requests", "طلبات تغيير مواعيدي"], ["lessons", "Previous Lessons", "الدروس السابقة"], ["courses", "Recorded Courses", "الدورات المسجلة"], ["projects", "Projects and Deliverables", "المشاريع والتسليمات"], ["student-statement", "Financial Summary and Statement", "الملخص المالي وكشف الحساب"], ["notifications", "Notifications", "الإشعارات"]] : [
        ...financial ? [["student-statement", "Student Statements", "كشوف الطلاب"], ["teacher-statement", "Teacher Statements", "كشوف المعلمين"], ["plans", "Installment Plans", "خطط الأقساط"]] : teacher ? [["teacher-statement", "Teacher Statement", "كشف المعلم"]] : [],
        ...user.role === "Admin" ? [["accounts", "Student Accounts", "حسابات الطلاب"]] : [],
        ...["Admin", "Accountant", "Coordinator", "Student", "Teacher"].includes(user.role) ? [["requests", "Pending Approvals", "طلبات الموافقة"]] : [],
        ...["Admin", "Coordinator", "Teacher"].includes(user.role) ? [["education", "Learning Materials & Assignments", "المحتوى والواجبات"]] : [],
        ...financial || teacher ? [["notifications", "Notifications", "الإشعارات"]] : [],
        ...financial ? [["audit", "Activity History", "سجل النشاط"]] : []
      ];
      const status = (s) => ({ Settled: tr("Settled", "تمت التسوية"), Withdrawn: tr("Withdrawn", "منسحب"), Upcoming: tr("Upcoming", "قادم"), Due: tr("Due", "مستحق"), Overdue: tr("Overdue", "متأخر"), Paid: tr("Paid", "مدفوع"), "Partially paid": tr("Partially paid", "مدفوع جزئياً"), Cancelled: tr("Cancelled", "ملغى"), Pending: tr("Pending", "قيد الانتظار"), Approved: tr("Approved", "مقبول"), Rejected: tr("Rejected", "مرفوض") })[s] || s;
      const descriptions = {
        withdrawals: ["Record a direct withdrawal. Historical charges and payments stay unchanged; refunds and fee settlements require separate financial processing.", "سجّل انسحابًا مباشرًا. الرسوم والمدفوعات السابقة محفوظة؛ رد الأموال وتسوية الرسوم يحتاجان إجراءً ماليًا منفصلًا."],
        overview: ["Your lessons, learning and next actions in one place.", "حصصك وموادك وخطواتك القادمة في مكان واحد."],
        schedule: ["Review upcoming lessons or request a different time.", "راجع حصصك القادمة أو اطلب موعدًا مختلفًا."],
        requests: ["Track requests and the decisions required before a change takes effect.", "تابع الطلبات والموافقات المطلوبة قبل تنفيذ أي تغيير."],
        notifications: ["Updates about your learning, schedule and account.", "آخر تحديثات الدراسة والمواعيد والحساب."],
        subjects: ["Your enrolled subjects and assigned teachers.", "المواد المشترك بها والمدرسون المسؤولون عنها."],
        lessons: ["Completed lessons, attendance and shared summaries.", "الحصص السابقة والحضور والملخصات المنشورة لك."],
        courses: ["Your recorded courses and released learning materials.", "كورساتك المسجلة والمحتوى المتاح لك."],
        projects: ["Track project stages, assignments and published feedback.", "تابع مراحل المشاريع والتكليفات والملاحظات المنشورة."],
        "student-statement": ["Review service charges, receipts, credit and installments.", "راجع رسوم الخدمات والمدفوعات والرصيد والأقساط."],
        "teacher-statement": ["Review earnings, payments and your statement in Egyptian pounds.", "راجع المستحقات والدفعات وكشف الحساب بالجنيه المصري."],
        plans: ["Manage installment dates against existing service agreements.", "نظّم مواعيد الأقساط المرتبطة باتفاقات الخدمات الحالية."],
        accounts: ["Manage student access and linked accounts.", "إدارة دخول الطلاب والحسابات المرتبطة بهم."],
        education: ["Release materials and assignments, review submissions and share feedback.", "انشر المحتوى والواجبات وراجع التسليمات وشارك الملاحظات."],
        audit: ["Review recorded administrative and financial changes.", "راجع التغييرات الإدارية والمالية المسجّلة."]
      };
      const translatedError = (message) => ({
        "Enter a withdrawal reason.": tr("Enter a withdrawal reason.", "اكتب سبب الانسحاب."),
        "Choose a withdrawal date between enrollment and today.": tr("Choose a withdrawal date between enrollment and today.", "اختر تاريخ انسحاب من تاريخ الاشتراك وحتى اليوم."),
        "Confirm that withdrawal does not settle or refund money.": tr("Confirm that withdrawal does not settle or refund money.", "أكد أن الانسحاب لا يسجل تسوية أو رد أموال."),
        "This enrollment is already withdrawn.": tr("This enrollment is already withdrawn.", "تم تسجيل انسحاب هذا الاشتراك بالفعل."),
        "Choose Egypt, Kuwait or the United Kingdom.": tr("Choose an available country.", "اختر دولة من القائمة المتاحة."),
        "This local time does not exist because of a daylight-saving change. Choose another time.": tr("This time is skipped by a daylight-saving change. Choose another time.", "هذا الوقت غير موجود بسبب الانتقال للتوقيت الصيفي. اختر وقتًا آخر."),
        "This local time occurs twice because of a daylight-saving change. Choose another time.": tr("This time occurs twice when clocks change. Choose another time.", "هذا الوقت يتكرر مرتين عند تغيير الساعة. اختر وقتًا آخر لتجنب الالتباس."),
        "The requested end must follow the requested start.": tr("The lesson end must be after its start.", "موعد نهاية الحصة يجب أن يكون بعد بدايتها."),
        "The requested lesson must fit within one academy day.": tr("This time crosses midnight in the academy schedule. Choose another slot.", "هذا الموعد يعبر منتصف الليل في جدول الأكاديمية. اختر فترة أخرى."),
        "Your timezone preference changed. Reload the schedule before requesting a new time.": tr("Your timezone setting changed. Reload the schedule before sending.", "إعداد التوقيت اتغير. حدّث الجدول قبل إرسال الطلب."),
        "Choose a different time.": tr("Choose a date or time different from the current lesson.", "اختر تاريخًا أو وقتًا مختلفًا عن موعد الحصة الحالي."),
        "A change request for this lesson is already awaiting approval.": tr("A request for this lesson is already awaiting approval. Check My Change Requests.", "يوجد طلب لهذه الحصة بانتظار الموافقة بالفعل. راجع صفحة طلبات تغيير مواعيدي."),
        "A short valid reason is required.": tr("Enter a short reason for the requested change.", "اكتب سببًا مختصرًا لطلب تغيير الموعد."),
        "Choose a future date and valid start/end times.": tr("Check the requested date and make sure the end follows the start.", "راجع التاريخ المطلوب وتأكد أن وقت النهاية بعد وقت البداية."),
        "This is a group lesson. Confirm that the requested change affects the whole group.": tr("Confirm that this group-lesson change affects the whole group.", "أكد أن تغيير موعد الحصة الجماعية يشمل المجموعة كلها.")
      })[message] || message;
      function feedback(target, message, kind = "error") {
        if (!target)
          return;
        target.hidden = false;
        target.dataset.kind = kind;
        target.classList.add("extension-feedback");
        target.setAttribute("role", kind === "error" ? "alert" : "status");
        target.textContent = message;
        target.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      }
      function error(e, form) {
        let target = form?.querySelector(".extension-feedback");
        if (form && !target) {
          target = document.createElement("div");
          form.append(target);
        }
        target = target || document.getElementById("extension-error");
        feedback(target, translatedError(e.message));
      }
      function action(id, fn) {
        const el = document.getElementById(id);
        if (el)
          el.onclick = () => {
            try {
              fn();
            } catch (e) {
              error(e);
            }
          };
      }
      function form(id, fn) {
        const el = document.getElementById(id);
        if (el)
          el.onsubmit = async (e) => {
            e.preventDefault();
            const button = el.querySelector('[type="submit"]');
            if (button?.disabled)
              return;
            if (button)
              button.disabled = true;
            try {
              const r = Object.fromEntries(new FormData(el)), result = await fn(r);
              await window.__APLUS_SAVE__?.();
              render();
              feedback(document.getElementById("extension-error"), result?.pending ? tr("Sent for approval; the active record has not changed.", "تم إرسال الطلب للموافقة؛ السجل المعتمد لم يتغير.") : tr("Saved successfully.", "تم الحفظ بنجاح."), "success");
            } catch (err) {
              error(err, el);
              if (button)
                button.disabled = false;
            }
          };
      }
      function nav() {
        if (student) {
          const nv = document.getElementById("nv");
          if (!nv.querySelector(".ui-nav-scroll"))
            nv.innerHTML = '<div class="ui-brand"><div class="ui-logo">A+</div><div><h1>A+ Hub Academy</h1><small>' + esc(user.display_name) + '</small></div></div><div class="ui-nav-scroll"></div>';
          document.getElementById("topbar").innerHTML = '<div class="ui-header-left">' + button("extension-menu", "☰", "☰") + "<strong>" + esc(tr(pages.find((p) => p[0] === page)?.[1] || "", pages.find((p) => p[0] === page)?.[2] || "")) + '</strong></div><div class="ui-header-right">' + button("extension-language", "العربية", "English") + button("extension-theme", "◐", "◐") + button("extension-logout", "Sign out", "تسجيل الخروج") + "</div>";
          action("extension-menu", () => document.body.classList.toggle("ui-drawer-open"));
          action("extension-language", () => {
            const lang = document.documentElement.lang === "ar" ? "en" : "ar";
            localStorage.setItem("aplus-ui-language", lang);
            document.documentElement.lang = lang;
            document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
            render();
          });
          action("extension-theme", () => {
            const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
            document.documentElement.dataset.theme = theme;
            localStorage.setItem("aplus-ui-theme", theme);
          });
          action("extension-logout", () => {
            window.__APLUS_TRANSPORT__.dispatch("POST", "/api/auth/logout", { "content-type": "application/json", "x-aplus-token": document.querySelector('meta[name="aplus-token"]').content }, "{}");
            window.__APLUS_SAVE__?.();
            location.href = "/";
          });
        }
        NAV.integrate(document.querySelector("#nv .ui-nav-scroll"), pages, { lang: document.documentElement.lang, active: extensionActive ? page : null });
        if (!student && extensionActive) {
          const title = pages.find((p) => p[0] === page), crumb = document.querySelector("#topbar .ui-breadcrumb strong"), group = NAV.groupFor(page);
          if (title && crumb)
            crumb.textContent = (group ? (document.documentElement.lang === "ar" ? group.ar : group.en) + " / " : "") + tr(title[1], title[2]);
        }
      }
      function picker(kind) {
        if (!directory)
          directory = api("directory");
        const rows = kind === "teacher" ? directory.teachers : directory.students;
        if (!rows.some((r) => String(r.id) === selection))
          selection = String(rows[0]?.id || "");
        return '<select id="extension-person" aria-label="' + tr("Selected account", "الحساب المحدد") + '">' + rows.map((r) => '<option value="' + r.id + '" ' + (String(r.id) === selection ? "selected" : "") + ">" + esc(r.name) + "</option>").join("") + "</select>";
      }
      function period(kind) {
        return '<div class="bar extension-controls">' + (financial ? picker(kind) : "") + field("from", "From", "من", "date", from) + field("to", "To", "إلى", "date", to) + button("extension-period", "Apply", "تطبيق") + button("extension-print", "Print / Save as PDF", "طباعة / حفظ كملف PDF", "↧ ") + "</div>";
      }
      function bindPeriod() {
        const p = document.getElementById("extension-person");
        if (p)
          p.onchange = () => {
            selection = p.value;
            render();
          };
        action("extension-period", () => {
          from = document.querySelector("[name=from]").value;
          to = document.querySelector("[name=to]").value;
          render();
        });
        action("extension-print", () => {
          document.body.classList.add("extension-printing");
          window.print();
        });
        window.onafterprint = () => document.body.classList.remove("extension-printing");
      }
      function installments(s) {
        return "<h3>" + tr("Installment schedule", "جدول الأقساط") + "</h3>" + s.installments.map((c) => "<h4>" + text(c.title) + " · #" + c.id + "</h4><p>" + tr("Unscheduled remainder", "المتبقي غير المجدول") + ": " + money(c.unplanned, c.currency) + "</p>" + table([tr("Due date", "تاريخ الاستحقاق"), tr("Amount", "المبلغ"), tr("Paid", "المدفوع"), tr("Remaining", "المتبقي"), tr("Status", "الحالة"), tr("Approved reason", "السبب المعتمد")], c.installments.map((i) => [text(i.due_on), money(i.amount, c.currency), money(i.paid, c.currency), money(i.remaining, c.currency), text(status(i.status)), text(i.reason)]))).join("");
      }
      function studentFinancial() {
        const query = new URLSearchParams({ from, to, ...financial ? { student: selection } : {} });
        const s = api("student-statement?" + query);
        statement = s;
        return period("student") + '<article id="extension-statement"><h3>A+ Hub Academy · ' + text(s.student) + "</h3><p>" + text(from || "—") + " → " + text(to || "—") + " · " + text(s.generatedAt) + "</p>" + (!s.complete ? '<p class="neg">' + tr("Incomplete: historical KWD conversions are unavailable or reconciliation needs review.", "غير مكتمل: تحويلات تاريخية إلى الدينار غير متاحة أو تحتاج المطابقة للمراجعة.") + "</p>" : "") + table([tr("Opening", "الرصيد الافتتاحي"), tr("Charges", "الرسوم"), tr("Payments", "المدفوعات"), tr("Adjustments", "التسويات"), tr("Closing", "الرصيد الختامي")], [[money(s.opening), money(s.charges), money(s.payments), money(s.adjustments), money(s.closing)]]) + "<p><strong>" + tr(s.credit ? "Credit in your favor" : "Amount outstanding", s.credit ? "رصيد لصالحك" : "المبلغ المستحق") + ": " + money(s.complete ? s.credit || s.outstanding : null) + "</strong></p><p>" + tr("Unallocated payments are separate from confirmed credit. Different currencies are not automatically offset.", "المدفوعات غير المخصصة منفصلة عن الرصيد المؤكد. لا تتم مقاصة العملات تلقائياً.") + "</p>" + table([tr("Date", "التاريخ"), tr("Entry", "القيد"), tr("Charge", "الرسوم"), tr("Payment / adjustment", "دفعة / تسوية"), tr("Conversion basis", "أساس التحويل")], s.entries.map((e) => [text(e.date || tr("Undated opening", "افتتاحي دون تاريخ")), text(e.description), e.kind === "Charge" ? money(e.amount) : "", e.kind !== "Charge" ? money(e.amount) : "", text(e.converted ? e.amount === null ? tr("Missing historical conversion", "تحويل تاريخي غير متوفر") : tr("Saved rate", "سعر محفوظ") + " " + e.rate : tr("Original KWD", "دينار أصلي"))])) + "<h3>" + tr("Service breakdown — all-time", "تفصيل الخدمات — كل الفترات") + "</h3>" + table([tr("Service", "الخدمة"), tr("Hours", "الساعات"), tr("Charge", "الرسوم"), tr("Attributed payments", "المدفوعات المخصصة"), tr("Remaining", "المتبقي"), tr("Status", "الحالة")], s.services.map((r) => [text(r.title), text(r.hours || ""), money(r.charge), money(r.paid), money(r.remaining), text(status(r.paymentStatus))])) + s.services.filter((x) => x.history.some((e) => e.kind !== "Charge")).map((r) => "<details><summary>" + text(r.title) + " · " + tr("Payment history", "سجل المدفوعات") + "</summary>" + table([tr("Date", "التاريخ"), tr("Reference", "المرجع"), tr("Amount", "المبلغ")], r.history.filter((e) => e.kind !== "Charge").map((e) => [text(e.date), text(e.description), money(e.amount)])) + "</details>").join("") + "<h3>" + tr("Unallocated payments", "مدفوعات غير مخصصة") + "</h3>" + table([tr("Date", "التاريخ"), tr("Reference", "المرجع"), tr("Amount", "المبلغ")], s.unallocated.map((e) => [text(e.date), text(e.description), money(e.amount)])) + "<p>" + tr("Reconciliation: service remaining − unallocated + other adjustments = account closing", "المطابقة: متبقي الخدمات − غير المخصص + التسويات الأخرى = رصيد الحساب") + "</p>" + table([tr("Service remaining", "متبقي الخدمات"), tr("Unallocated", "غير مخصص"), tr("Other adjustments", "تسويات أخرى"), tr("Account closing", "رصيد الحساب")], [[money(s.reconciliation.serviceRemaining), money(s.reconciliation.unallocated), money(s.reconciliation.otherAdjustments), money(s.reconciliation.accountClosing)]]) + installments(s) + "<p>" + tr("Original KWD or each record’s historical saved conversion only; no current rate. Missing conversions make this statement incomplete. Installments are agreements, not additional charges or cash.", "دينار أصلي أو تحويل محفوظ تاريخياً لكل قيد فقط؛ لا يستخدم سعر اليوم. التحويلات المفقودة تجعل الكشف غير مكتمل. الأقساط اتفاقات وليست رسوماً أو أموالاً إضافية.") + "</p></article>";
      }
      function teacherFinancial() {
        if (financial && !directory)
          directory = api("directory");
        const s = api("teacher-statement?" + new URLSearchParams({ from, to, ...financial ? { teacher: selection } : {} }));
        statement = s;
        return period("teacher") + '<article id="extension-statement"><h3>A+ Hub Academy · ' + text(s.teacher) + "</h3><p>" + text(s.generatedAt) + "</p>" + (!s.complete ? '<p class="neg">' + tr("Incomplete conversion", "تحويل غير مكتمل") + "</p>" : "") + table([tr("Opening", "افتتاحي"), tr("Earnings", "المستحقات"), tr("Payments", "المدفوعات"), tr("Closing", "ختامي")], [[money(s.opening, "EGP"), money(s.periodEarned, "EGP"), money(s.periodPaid, "EGP"), money(s.periodClosing, "EGP")]]) + table([tr("Date", "التاريخ"), tr("Service", "الخدمة"), tr("Student", "الطالب"), tr("Hours", "الساعات"), tr("Recorded hourly rate", "سعر الساعة المسجل"), tr("Agreed percentage", "النسبة المتفق عليها"), tr("Recorded EGP", "الجنيه المسجل"), tr("Admin-equivalent earned", "المستحق المكافئ للإدارة"), tr("Payment", "الدفعة"), tr("Method / source", "الطريقة / المصدر")], s.entries.map((e) => [text(e.date), text(e.description), text(e.student), text(e.hours), money(e.hourlyRateEGP, "EGP"), e.agreedPercent == null ? "" : text(e.agreedPercent + "%"), money(e.recordedEarnedEGP ?? e.recordedPaymentEGP, "EGP"), money(e.earned, "EGP"), money(e.paid, "EGP"), text([e.method, e.workType].filter(Boolean).join(" · "))])) + "<h3>" + tr("Batch payment coverage", "تغطية الدفعات المجمعة") + "</h3>" + table([tr("Payment", "الدفعة"), tr("Student", "الطالب"), tr("Hours", "الساعات"), tr("Period", "الفترة")], s.entries.flatMap((e) => (e.allocations || []).map((x) => [text("#" + e.id), text(x.student), text(x.hours), text(x.startsOn + " → " + x.endsOn)]))) + "<p>" + tr("Foreign equivalents are display-only using the latest saved Settings EGP rate. Recorded EGP values are preserved above. Settlement calculations are unchanged.", "المكافئ الأجنبي للعرض فقط باستخدام آخر سعر جنيه محفوظ في الإعدادات. قيم الجنيه الأصلية محفوظة أعلاه. حسابات التسوية لم تتغير.") + " " + text(s.settingsRate) + " · " + text(s.valuedAt || tr("Rate date unavailable", "تاريخ السعر غير متاح")) + "</p><p>" + tr("Negative closing balances indicate excess payment or an advance; unassigned older payments appear separately in the original Financial Summary.", "الرصيد الختامي السالب يعني دفعة زائدة أو مقدماً؛ تظهر المدفوعات القديمة غير المخصصة منفصلة في الملخص المالي الأصلي.") + "</p></article>";
      }
      function accounts() {
        const a = api("accounts");
        return '<form id="extension-account-form"><div class="fg">' + field("id", "Account ID (blank for new)", "رقم الحساب (فارغ للجديد)", "number") + field("username", "Username", "اسم المستخدم") + field("display_name", "Display name", "الاسم الظاهر") + "<label>" + tr("Linked student", "الطالب المرتبط") + '<select name="student_id">' + a.students.map((s) => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("") + "</select></label>" + field("password", "Password (12+ characters)", "كلمة المرور (١٢ حرفاً أو أكثر)", "password") + "<label>" + tr("Status", "الحالة") + '<select name="active"><option value="1">' + tr("Active", "نشط") + '</option><option value="0">' + tr("Disabled", "معطل") + '</option></select></label></div><button class="b" type="submit">' + tr("Save account", "حفظ الحساب") + "</button></form>" + table([tr("ID", "الرقم"), tr("Username", "اسم المستخدم"), tr("Student", "الطالب"), tr("Status", "الحالة")], a.accounts.map((x) => [text(x.id), text(x.username), text(a.students.find((s) => s.id === x.student_id)?.name), text(x.active ? tr("Active", "نشط") : tr("Disabled", "معطل"))]));
      }
      function plans() {
        const prefix = picker("student"), s = api("plans?student=" + selection);
        return '<div class="bar">' + prefix + "</div>" + installments(s) + '<form id="extension-plan-form"><div class="fg">' + field("id", "Installment ID (blank for new)", "رقم القسط (فارغ للجديد)", "number") + "<label>" + tr("Existing obligation", "الالتزام القائم") + '<select name="contract_id">' + s.installments.map((c) => '<option value="' + c.id + '">' + esc(c.title) + " #" + c.id + "</option>").join("") + "</select></label>" + field("due_on", "Due date", "تاريخ الاستحقاق", "date") + field("amount", "Amount (original currency)", "المبلغ (العملة الأصلية)", "number") + field("reason", "Student-facing reason", "السبب الظاهر للطالب") + '</div><button class="b" type="submit">' + tr("Submit plan", "إرسال الخطة") + "</button></form>";
      }
      const notificationsText = (k) => ({ CourseWithdrawn: tr("Course enrollment withdrawn; review its financial settlement separately", "تم تسجيل الانسحاب من الكورس؛ التسوية المالية إجراء منفصل"), RescheduleRequested: tr("Lesson time-change request awaiting your decision", "طلب تغيير موعد حصة بانتظار قرارك"), RescheduleRejected: tr("Lesson time-change request rejected", "تم رفض طلب تغيير موعد الحصة"), RescheduleAwaitingSecondApproval: tr("One approval recorded; waiting for the other party", "تم تسجيل موافقة وبانتظار الطرف الآخر"), PaymentRecorded: tr("Payment recorded", "تم تسجيل دفعة"), TeacherPayment: tr("Teacher payment recorded", "تم تسجيل دفعة للمعلم"), FinancialCorrection: tr("Financial correction", "تصحيح مالي"), RefundRecorded: tr("Refund recorded", "تم تسجيل استرداد"), CreditChanged: tr("Credit changed", "تم تعديل الرصيد"), PlanChanged: tr("Installment plan approved or changed", "تم اعتماد أو تعديل خطة الأقساط"), ScheduleChanged: tr("Schedule change approved", "تمت الموافقة على تغيير الجدول"), MaterialReleased: tr("Learning item released", "تم نشر مادة تعليمية"), FeedbackPublished: tr("Feedback published", "تم نشر الملاحظات") })[k] || k;
      const zoneLabel = (zone) => {
        const z = TZ.ZONES.find((z) => z.id === zone);
        return z ? tr(z.en, z.ar) : zone;
      };
      function shown(row, zone = data?.timezone || TZ.ACADEMY) {
        const x = row.displayTimezone === zone ? row : TZ.display(row, zone);
        return { date: x.displayDate || row.date, start: x.displayStart || row.startsAt, endDate: x.displayEndDate || row.date, end: x.displayEnd || row.endsAt, issue: x.timeIssue };
      }
      function timeText(row, zone) {
        const x = shown(row, zone);
        return x.issue ? text(tr("Time needs review", "التوقيت يحتاج مراجعة")) : '<bdi dir="ltr">' + esc(x.date + " · " + x.start + "–" + (x.endDate !== x.date ? x.endDate + " " : "") + x.end) + "</bdi>";
      }
      function timezoneSettings(s) {
        return '<div class="extension-timezone-settings"><label>' + tr("My country / timezone", "دولتي / التوقيت المعتمد") + '<select id="extension-timezone">' + TZ.ZONES.map((z) => '<option value="' + z.id + '" ' + (s.timezone === z.id ? "selected" : "") + ">" + esc(tr(z.en, z.ar)) + "</option>").join("") + "</select></label><p>" + tr("Your lesson times and change requests use this timezone. Daylight-saving changes are handled automatically. Changing this setting does not move a lesson.", "تظهر مواعيد حصصك وطلبات التغيير بهذا التوقيت، مع مراعاة التوقيت الصيفي تلقائيًا. تغيير الإعداد لا يغيّر موعد الحصة.") + '</p></div><div id="extension-timezone-feedback" aria-live="polite"></div>';
      }
      function bindTimezone() {
        const select = document.getElementById("extension-timezone");
        if (!select)
          return;
        select.onchange = async () => {
          const oldZone = data.timezone, nextZone = select.value, form = document.getElementById("extension-reschedule-form"), draft = form ? Object.fromEntries(new FormData(form)) : null;
          let a, b;
          if (draft)
            try {
              a = TZ.convert(draft.date, draft.starts_at, oldZone, nextZone);
              b = TZ.convert(draft.end_date || draft.date, draft.ends_at, oldZone, nextZone);
            } catch (_) {}
          select.disabled = true;
          try {
            api("timezone", { timezone: nextZone });
            await window.__APLUS_SAVE__?.();
            render();
            const nextForm = document.getElementById("extension-reschedule-form");
            if (draft && nextForm) {
              const choice = (data.rescheduleChoices || []).find((x) => x.key === draft.lesson_key);
              if (choice) {
                document.getElementById("extension-reschedule-subject").value = choice.subject;
                document.getElementById("extension-reschedule-subject").onchange();
                document.getElementById("extension-reschedule-lesson").value = choice.key;
                document.getElementById("extension-reschedule-lesson").onchange();
              }
              if (a && b) {
                nextForm.elements.date.value = a.date;
                nextForm.elements.starts_at.value = a.time;
                nextForm.elements.end_date.value = b.date;
                nextForm.elements.ends_at.value = b.time;
                nextForm.dataset.startDate = a.date;
              }
              nextForm.elements.reason.value = draft.reason || "";
              nextForm.elements.acknowledge_group.checked = draft.acknowledge_group === "on";
            }
            feedback(document.getElementById("extension-timezone-feedback"), tr("Your timezone is saved. Lesson times now use ", "تم حفظ توقيتك. مواعيد الحصص تُعرض الآن بتوقيت ") + zoneLabel(nextZone), "success");
          } catch (e) {
            select.value = oldZone;
            select.disabled = false;
            feedback(document.getElementById("extension-timezone-feedback"), translatedError(e.message));
          }
        };
      }
      function requests() {
        const rows = api("requests").rows;
        return '<p class="mut">' + tr("Times shown in: ", "المواعيد بتوقيت: ") + esc(zoneLabel(rows[0]?.displayTimezone || (student ? data?.timezone || TZ.ACADEMY : TZ.ACADEMY))) + "</p>" + table([tr("Subject / student", "المادة / الطالب"), tr("Current lesson", "الحصة الحالية"), tr("Requested time", "الموعد المطلوب"), tr("Status", "الحالة"), tr("Administration", "الإدارة"), tr("Teacher", "المدرس"), tr("Reason / result", "السبب / النتيجة"), tr("Decision", "القرار")], rows.map((q) => {
          const r = JSON.parse(q.record), reschedule = q.kind === "reschedule", { previous: old, proposed: next } = r;
          const can = q.status === "Pending" && (reschedule ? user.role === "Admin" && q.adminApproval === "Pending" || user.role === "Teacher" && q.teacherApproval === "Pending" : user.role === "Admin");
          return [text(reschedule ? (r.subject || "") + (q.studentName ? " · " + q.studentName : "") : q.kind), old ? timeText(old, q.displayTimezone || TZ.ACADEMY) : "", next ? timeText({ date: next.date, startsAt: next.starts_at, endsAt: next.ends_at }, q.displayTimezone || TZ.ACADEMY) : "", text(status(q.status)), reschedule ? text(status(q.adminApproval)) : "", reschedule ? text(status(q.teacherApproval)) : "", text(q.reason) + (q.result ? "<br>" + text(JSON.parse(q.result).reason) : ""), can ? '<button class="b2" data-decide="' + q.id + '" data-status="Approved">' + tr("Approve", "موافقة") + '</button> <button class="b2" data-decide="' + q.id + '" data-status="Rejected">' + tr("Reject", "رفض") + "</button>" : ""];
        }));
      }
      function rescheduleForm(s) {
        const choices = (s.rescheduleChoices || []).filter((x) => !x.timeIssue);
        if (!choices.length)
          return "<p>" + tr("No upcoming lessons are available for a change request.", "لا توجد حصص قادمة متاحة لطلب تغيير موعد.") + "</p>";
        const subjects = [...new Set(choices.map((x) => x.subject))];
        return "<h3>" + tr("Request a time change", "طلب تغيير موعد") + "</h3><p>" + tr("Choose a subject and its lesson. The schedule changes only after BOTH the assigned teacher and administration approve.", "اختر المادة والحصة. لن يتغير الجدول إلا بعد موافقة المدرس المسؤول والإدارة معًا.") + '</p><form id="extension-reschedule-form"><div class="fg"><label>' + tr("Subject", "المادة") + '<select id="extension-reschedule-subject">' + subjects.map((x) => "<option>" + esc(x) + "</option>").join("") + "</select></label><label>" + tr("Lesson to change", "الحصة المطلوب تغيير موعدها") + '<select name="lesson_key" id="extension-reschedule-lesson" dir="ltr"></select></label>' + field("date", "Requested start date", "تاريخ البداية المطلوب", "date") + field("starts_at", "Requested start", "البداية المطلوبة", "time") + field("end_date", "Requested end date", "تاريخ النهاية المطلوب", "date") + field("ends_at", "Requested end", "النهاية المطلوبة", "time") + field("reason", "Reason", "السبب") + '</div><label id="extension-reschedule-group" style="display:none"><input type="checkbox" name="acknowledge_group"> ' + tr("This is a group lesson: the request changes the selected lesson for the whole group.", "هذه حصة جماعية: الطلب يغيّر موعد الحصة المحددة لكل المجموعة.") + '</label><div id="extension-reschedule-result" hidden></div><div class="extension-form-actions"><small>' + tr("The current lesson stays unchanged until both approvals.", "موعد الحصة الحالي يظل كما هو لحين اكتمال الموافقتين.") + '</small><button class="b" type="submit">' + tr("Send request", "إرسال الطلب") + "</button></div></form>";
      }
      function bindReschedule() {
        const form = document.getElementById("extension-reschedule-form");
        if (!form)
          return;
        const choices = (data.rescheduleChoices || []).filter((x) => !x.timeIssue), subject = document.getElementById("extension-reschedule-subject"), lesson = document.getElementById("extension-reschedule-lesson"), result = document.getElementById("extension-reschedule-result");
        let sent = false, requestKey = token();
        const pick = () => {
          const row = choices.find((x) => x.key === lesson.value);
          if (!row)
            return;
          const x = shown(row);
          form.elements.date.value = x.date;
          form.elements.starts_at.value = x.start;
          form.elements.end_date.value = x.endDate;
          form.elements.ends_at.value = x.end;
          form.dataset.startDate = x.date;
          const group = document.getElementById("extension-reschedule-group");
          group.style.display = row.group ? "flex" : "none";
          form.elements.acknowledge_group.required = row.group;
          form.elements.acknowledge_group.checked = false;
        };
        subject.onchange = () => {
          lesson.innerHTML = choices.filter((x) => x.subject === subject.value).map((x) => '<option value="' + esc(x.key) + '">' + esc(shown(x).date + " · " + shown(x).start + "–" + shown(x).end + " · " + x.teacher) + "</option>").join("");
          pick();
        };
        lesson.onchange = pick;
        subject.onchange();
        for (const key of ["date", "starts_at", "end_date", "ends_at", "reason"])
          form.elements[key].required = true;
        form.elements.date.onchange = () => {
          const previousDate = form.dataset.startDate || form.elements.date.value, difference = Date.parse(form.elements.end_date.value + "T00:00:00Z") - Date.parse(previousDate + "T00:00:00Z");
          if (Number.isFinite(difference) && Number.isFinite(Date.parse(form.elements.date.value + "T00:00:00Z")))
            form.elements.end_date.value = new Date(Date.parse(form.elements.date.value + "T00:00:00Z") + difference).toISOString().slice(0, 10);
          form.dataset.startDate = form.elements.date.value;
        };
        form.noValidate = true;
        form.onsubmit = async (event) => {
          event.preventDefault();
          const button = form.querySelector('[type="submit"]');
          if (sent || button.disabled)
            return;
          const row = choices.find((x) => x.key === lesson.value), r = Object.fromEntries(new FormData(form));
          if (!row) {
            feedback(result, tr("Choose an upcoming lesson.", "اختر حصة قادمة."));
            return;
          }
          if (!form.checkValidity()) {
            feedback(result, tr("Complete the required fields and confirm the group notice when shown.", "أكمل الحقول المطلوبة وأكد تنبيه الحصة الجماعية عند ظهوره."));
            form.reportValidity();
            return;
          }
          const original = shown(row);
          if (r.date === original.date && r.starts_at === original.start && r.end_date === original.endDate && r.ends_at === original.end) {
            feedback(result, translatedError("Choose a different time."));
            form.elements.date.focus();
            return;
          }
          button.disabled = true;
          button.textContent = tr("Sending…", "جارٍ الإرسال…");
          try {
            api("reschedule", { ...r, timezone: data.timezone || TZ.ACADEMY, acknowledge_group: r.acknowledge_group === "on", request_key: requestKey });
            await window.__APLUS_SAVE__?.();
            sent = true;
            button.textContent = tr("Request sent", "تم إرسال الطلب");
            feedback(result, tr("Your request was sent to the assigned teacher and administration. The current lesson has not changed.", "تم إرسال طلبك للمدرس المسؤول والإدارة. موعد الحصة الحالي لم يتغير."), "success");
            const a = document.createElement("a");
            a.href = "#preview-requests";
            a.dataset.extension = "requests";
            a.textContent = tr("Track request approvals", "متابعة موافقات الطلب");
            result.append(document.createElement("br"), a);
          } catch (err) {
            error(err, form);
            button.disabled = false;
            button.textContent = tr("Send request", "إرسال الطلب");
          }
        };
      }
      function education() {
        const r = api("education");
        return "<p>" + tr("Share lesson files, HTTPS links and assignments with the assigned student; review submissions and publish feedback. Drafts and internal notes stay private.", "شارك ملفات الحصة وروابطها والواجبات مع الطالب المسؤول عنه، وراجع تسليماته وانشر الملاحظات له. المسودات والملاحظات الداخلية تظل خاصة.") + "</p>" + '<form id="extension-share-form"><div class="fg">' + field("id", "Share ID (blank for new)", "رقم المشاركة (فارغ للجديد)", "number") + field("student_id", "Existing student ID", "رقم الطالب الحالي", "number") + "<label>" + tr("Source kind", "نوع المصدر") + '<select name="kind">' + ["Lesson", "Assignment", "Project", "Stage", "Course", "Meeting"].map((k) => "<option>" + k + "</option>").join("") + "</select></label>" + field("source_id", "Existing source ID", "رقم السجل الأصلي", "number") + field("title", "Title", "العنوان") + field("body", "Shared text", "النص المشترك") + field("url", "HTTPS link", "رابط HTTPS", "url") + field("due_on", "Deadline", "الموعد النهائي", "date") + "<label>" + tr("Visibility", "الظهور") + '<select name="released"><option value="0">' + tr("Private draft", "مسودة خاصة") + '</option><option value="1">' + tr("Released to student", "منشور للطالب") + '</option></select></label></div><button class="b" type="submit">' + tr("Save learning item", "حفظ المادة") + "</button></form>" + table([tr("ID", "الرقم"), tr("Title", "العنوان"), tr("Student", "الطالب"), tr("Released", "منشور")], r.shares.map((s) => [text(s.id), text(s.title), text(s.student_id), text(s.released)])) + "<h3>" + tr("Submissions and feedback", "التسليمات والملاحظات") + "</h3>" + table([tr("ID", "الرقم"), tr("Assignment", "التكليف"), tr("Submission", "التسليم"), tr("Feedback", "الملاحظات")], r.submissions.map((s) => [text(s.id), text(s.title), text(s.body) + " " + link(s.url), text(s.feedback || "")])) + '<form id="extension-feedback-form"><div class="fg">' + field("submission_id", "Submission ID", "رقم التسليم", "number") + field("body", "Feedback", "الملاحظات") + "<label>" + tr("Visibility", "الظهور") + '<select name="published"><option value="0">' + tr("Private", "خاص") + '</option><option value="1">' + tr("Published", "منشور") + '</option></select></label></div><button class="b" type="submit">' + tr("Save feedback", "حفظ الملاحظات") + "</button></form>";
      }
      function learning() {
        data = api("student");
        const s = data;
        const lessonRows = (rows) => table([tr("Date", "التاريخ"), tr("Time", "الوقت"), tr("Subject", "المادة"), tr("Teacher", "المعلم"), tr("Duration", "المدة"), tr("Status", "الحالة"), tr("Meeting", "الاجتماع")], rows.map((l) => [text(shown(l).date), '<bdi dir="ltr">' + esc(shown(l).start + " → " + (shown(l).endDate !== shown(l).date ? shown(l).endDate + " " : "") + shown(l).end) + "</bdi>", text(l.subject), text(l.teacher), text(l.duration), text(status(l.status)), link(l.meetingLink)]));
        if (page === "overview") {
          const fin = api("student-statement"), next = s.schedule.find((l) => !["Cancelled", "Completed"].includes(l.status)), installment = fin.installments.flatMap((c) => c.installments).filter((i) => i.remaining > 0 && i.status !== "Cancelled").sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
          return "<h3>" + text(s.student.name) + "</h3><h3>" + tr("Next lesson", "الدرس القادم") + "</h3>" + lessonRows(next ? [next] : []) + "<p>" + tr("My timezone", "توقيتي") + ": " + text(zoneLabel(s.timezone)) + "</p><h3>" + tr("Enrolled subjects", "المواد المسجلة") + "</h3>" + s.subjects.map((x) => text(x.name)).join(" · ") + "<h3>" + tr("Active projects and deadlines", "المشاريع النشطة والمواعيد") + "</h3>" + table([tr("Project", "المشروع"), tr("Deadline", "الموعد")], s.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status)).map((p) => [text(p.name), text(p.due)])) + "<h3>" + tr("Next installment", "القسط القادم") + "</h3><p>" + (installment ? money(installment.remaining, fin.installments.find((c) => c.installments.some((i) => i.id === installment.id))?.currency) + " · " + text(installment.due_on) : tr("No scheduled installment", "لا يوجد قسط مجدول")) + "</p>";
        }
        if (page === "subjects")
          return table([tr("Subject", "المادة"), tr("Teacher", "المعلم"), tr("Service", "الخدمة")], s.subjects.map((x) => [text(x.name), text(x.teacher), text(x.type)]));
        if (page === "schedule")
          return timezoneSettings(s) + lessonRows(s.schedule) + rescheduleForm(s);
        if (page === "lessons")
          return table([tr("Date", "التاريخ"), tr("Subject", "المادة"), tr("Teacher", "المعلم"), tr("Hours", "الساعات"), tr("Attendance", "الحضور"), tr("Shared summary", "الملخص المشترك")], s.lessons.map((l) => [text(l.date), text(l.subject), text(l.teacher), text(l.hours), text(l.attendance), l.summary.map((x) => text(x.body)).join("<br>")]));
        if (page === "courses")
          return s.courses.map((c) => "<h3>" + text(c.name) + "</h3>" + (c.withdrawal ? "<p>" + tr("Withdrawn", "منسحب") + " · " + text(c.withdrawal.withdrawn_on) + " · " + text(c.withdrawal.reason) + "</p><p>" + tr("Financial settlement is separate. Review your statement; withdrawal alone does not waive charges or confirm a refund.", "التسوية المالية منفصلة. راجع كشف حسابك؛ الانسحاب وحده لا يلغي الرسوم ولا يؤكد رد الأموال.") + "</p>" : "") + table([tr("Released material", "المادة المنشورة"), tr("Link", "الرابط")], c.materials.map((m) => [text(m.title), link(m.url)])) + s.shares.filter((x) => x.kind === "Course" && x.source_id === c.id).map((x) => "<p>" + text(x.title) + " · " + text(x.body) + " " + link(x.url) + "</p>").join("")).join("") || tr("No enrollments", "لا توجد تسجيلات");
        return s.projects.map((p) => "<h3>" + text(p.name) + " · " + text(p.teacher) + "</h3>" + table([tr("Stage", "المرحلة"), tr("Deadline", "الموعد"), tr("Status", "الحالة")], p.stages.map((x) => [text(x.title), text(x.due_on), text(status(x.status))]))).join("") + "<h3>" + tr("Released assignments", "التكليفات المنشورة") + "</h3>" + s.shares.filter((x) => ["Assignment", "Project", "Stage"].includes(x.kind)).map((x) => {
          const sub = s.submissions.find((a) => a.share_id === x.id);
          return "<h4>" + text(x.title) + "</h4><p>" + text(x.body) + " " + link(x.url) + " · " + text(x.due_on) + '</p><form data-submit="' + x.id + '"><div class="fg">' + field("body", "Submission", "التسليم", "text", sub?.body || "") + field("url", "HTTPS link", "رابط HTTPS", "url", sub?.url || "") + '</div><button class="b" type="submit">' + tr("Submit", "تسليم") + "</button></form><p>" + tr("Published feedback", "الملاحظات المنشورة") + ": " + text(sub?.feedback || "") + "</p>";
        }).join("");
      }
      function render() {
        try {
          if (!pages.some((x) => x[0] === page))
            return;
          extensionActive = true;
          nav();
          const v = document.getElementById("v");
          if (!v)
            return;
          const name = pages.find((x) => x[0] === page);
          v.innerHTML = '<section id="extension-view" data-ui-user-content><header class="extension-heading"><p class="extension-eyebrow">' + esc(NAV.groupFor(page) ? tr(NAV.groupFor(page).en, NAV.groupFor(page).ar) : "") + "</p><h2>" + esc(tr(name?.[1] || "", name?.[2] || "")) + '</h2><p class="extension-description">' + esc(tr(...descriptions[page] || ["", ""])) + '</p></header><div id="extension-error" aria-live="polite"></div>' + (page === "student-statement" ? (financial ? (directory || (directory = api("directory")), selection || (selection = String(directory.students[0]?.id || ""))) : null, studentFinancial()) : page === "teacher-statement" ? (financial ? (directory || (directory = api("directory")), selection || (selection = String(directory.teachers[0]?.id || ""))) : null, teacherFinancial()) : page === "accounts" ? accounts() : page === "plans" ? plans() : page === "requests" ? requests() : page === "education" ? education() : page === "audit" ? table(["Date", "Actor", "Action", "Entity", "ID"], api("audit").rows.map((r) => [text(r.at), text(r.actor), text(r.action), text(r.entity), text(r.entity_id)])) : page === "notifications" ? table([tr("Date", "التاريخ"), tr("Notification", "الإشعار"), tr("Record", "السجل"), tr("Read", "قراءة")], api("notifications").rows.map((n) => [text(n.created_at), text(notificationsText(n.kind)), '<a href="#preview-' + (n.kind === "CourseWithdrawn" ? student ? "courses" : teacher ? "teacher-statement" : "withdrawals" : n.kind.startsWith("Reschedule") ? "requests" : n.kind === "ScheduleChanged" ? student ? "schedule" : "requests" : n.recipient_kind === "Teacher" ? "teacher-statement" : ["MaterialReleased", "FeedbackPublished"].includes(n.kind) ? "projects" : n.kind === "ScheduleChanged" ? "schedule" : "student-statement") + '">' + text("#" + n.reference) + "</a>", student || teacher || n.recipient_kind === "Admin" ? '<button class="b2" data-read="' + n.id + '" ' + (n.read_at ? "disabled" : "") + ">" + tr(n.read_at ? "Read" : "Mark read", n.read_at ? "مقروء" : "تحديد كمقروء") + "</button>" : ""])) : learning()) + "</section>";
          bindPeriod();
          form("extension-account-form", (r) => api("accounts", { ...r, id: r.id ? Number(r.id) : undefined, student_id: Number(r.student_id), active: Number(r.active) }));
          form("extension-plan-form", (r) => api("plan", { request_key: token(), reason: r.reason, record: { id: r.id ? Number(r.id) : undefined, contract_id: Number(r.contract_id), due_on: r.due_on, amount: Math.round(Number(r.amount) * 1000), note: r.reason } }));
          const person = document.getElementById("extension-person");
          if (page === "plans" && person)
            person.onchange = () => {
              selection = person.value;
              render();
            };
          bindReschedule();
          bindTimezone();
          form("extension-share-form", (r) => api("share", { ...r, id: r.id ? Number(r.id) : undefined, student_id: Number(r.student_id), source_id: Number(r.source_id), released: Number(r.released) }));
          form("extension-feedback-form", (r) => api("feedback", { ...r, submission_id: Number(r.submission_id), published: Number(r.published) }));
          document.querySelectorAll("[data-submit]").forEach((el) => el.onsubmit = (e) => {
            e.preventDefault();
            try {
              api("submit", { share_id: Number(el.dataset.submit), ...Object.fromEntries(new FormData(el)) });
              render();
            } catch (err) {
              error(err);
            }
          });
          document.querySelectorAll("[data-read]").forEach((el) => el.onclick = () => {
            try {
              api("read", { id: el.dataset.read.startsWith("staff:") ? el.dataset.read : Number(el.dataset.read) });
              render();
            } catch (e) {
              error(e);
            }
          });
          document.querySelectorAll("[data-decide]").forEach((el) => el.onclick = () => {
            const cell = el.closest("td");
            cell.querySelector("form")?.remove();
            const panel = document.createElement("form");
            panel.innerHTML = field("reason", "Decision reason visible to the student", "سبب القرار الظاهر للطالب") + '<button class="b" type="submit">' + tr("Confirm decision", "تأكيد القرار") + '</button> <button class="b2" type="button">' + tr("Cancel", "إلغاء") + "</button>";
            cell.append(panel);
            panel.elements.reason.required = true;
            panel.elements.reason.focus();
            panel.querySelector('[type="button"]').onclick = () => panel.remove();
            panel.onsubmit = (e) => {
              e.preventDefault();
              try {
                api("decision", { id: Number(el.dataset.decide), status: el.dataset.status, reason: panel.elements.reason.value });
                render();
              } catch (err) {
                error(err);
              }
            };
          });
        } catch (e) {
          error(e);
        }
      }
      document.addEventListener("click", (e) => {
        const a = e.target.closest("[data-route]");
        if (a) {
          extensionActive = false;
          document.querySelectorAll("#nv [data-extension]").forEach((x) => {
            x.classList.remove("on");
            x.removeAttribute("aria-current");
          });
          if (location.hash.startsWith("#preview-"))
            history.replaceState(null, "", location.pathname + location.search);
        }
      }, true);
      document.addEventListener("click", (e) => {
        const a = e.target.closest("[data-extension]");
        if (a) {
          e.preventDefault();
          page = a.dataset.extension;
          selection = "";
          document.body.classList.remove("ui-drawer-open");
          location.hash = "preview-" + page;
          render();
        }
      });
      window.addEventListener("hashchange", () => {
        const key = location.hash.replace("#preview-", "");
        if (pages.some((p) => p[0] === key)) {
          page = key;
          render();
        }
      });
      const sharedStyle = document.createElement("style");
      sharedStyle.textContent = require_fs().readFileSync("/app/preview/presentation.css", "utf8");
      document.head.append(sharedStyle);
      const css = document.createElement("style");
      css.textContent = "#extension-view{color:var(--ink);letter-spacing:0}#extension-view .fg{margin:16px 0}#extension-view form{margin:20px 0}#extension-view label{display:flex;flex-direction:column;gap:6px}#extension-view .tw{width:100%}#extension-view table{width:100%}#extension-view td{overflow-wrap:anywhere}#extension-view .bar{flex-wrap:wrap}#extension-view input{max-width:100%}#extension-view h2{letter-spacing:0}@media print{body.extension-printing #nv,body.extension-printing #topbar,body.extension-printing #aplus-preview-badge,body.extension-printing .extension-controls,body.extension-printing #extension-error{display:none!important}body.extension-printing #extension-view{background:var(--card);color:var(--ink)}body.extension-printing #workspace{margin:0}body.extension-printing #extension-statement details{display:block}body.extension-printing #extension-statement details>*{display:block}body.extension-printing #extension-statement th{position:static}body.extension-printing #extension-statement tr{break-inside:avoid}}";
      document.head.insertBefore(css, sharedStyle);
      const initialPage = location.hash.replace("#preview-", "");
      if (pages.some((p) => p[0] === initialPage)) {
        page = initialPage;
        extensionActive = true;
      }
      if (student) {
        const lang = localStorage.getItem("aplus-ui-language") === "ar" ? "ar" : "en";
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
        document.documentElement.dataset.theme = localStorage.getItem("aplus-ui-theme") === "dark" ? "dark" : "light";
        render();
      } else {
        if (extensionActive)
          render();
        else
          nav();
        new MutationObserver(() => nav()).observe(document.getElementById("nv"), { childList: true, subtree: true });
      }
      require_course_withdrawal_ui().mount(user);
      window.__APLUS_EXTENSION__ = { open: (k) => {
        page = k;
        selection = "";
        render();
      }, statement: () => statement };
      new MutationObserver(() => {
        if (student)
          return;
        document.getElementById("extension-nav")?.remove();
        nav();
        if (document.getElementById("extension-view"))
          render();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    }
    module.exports = { studentPage, mount };
  });

  // aplus-preview/extensions/backups-ui.js
  var require_backups_ui = __commonJS(function(exports, module) {
    function mount() {
      const rt = window.__APLUS_TRANSPORT__;
      const auth = JSON.parse(rt.dispatch("GET", "/api/auth/status").text());
      if (auth.user?.role !== "Admin")
        return;
      const labels = new Map, originalText = new WeakMap;
      const tr = (en, ar) => {
        labels.set(en, { en, ar });
        labels.set(ar, { en, ar });
        return document.documentElement.lang === "ar" ? ar : en;
      };
      const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      const headers = () => ({ "content-type": "application/json", "x-aplus-token": document.querySelector('meta[name="aplus-token"]')?.content });
      const api = (action, data) => {
        const r = rt.dispatch(data ? "POST" : "GET", "/api/preview/backups" + action, data ? headers() : {}, data ? JSON.stringify(data) : undefined);
        const b = JSON.parse(r.text());
        if (!b.ok)
          throw Error(b.error);
        return b;
      };
      const download = (data, name) => {
        const u = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = u;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1e4);
      };
      let validation = null, packageData = null;
      function attach() {
        const active = document.querySelector('#nv [data-route="Settings"].on');
        const view = document.getElementById("v");
        if (!active || !view || view.querySelector("#database-transfer"))
          return;
        const section = document.createElement("section");
        section.id = "database-transfer";
        section.className = "cd";
        section.setAttribute("data-ui-user-content", "");
        section.innerHTML = "<h2>" + tr("Data & Backups", "البيانات والنسخ الاحتياطية") + "</h2><p>" + tr("Full SQLite backup, including accounts and portal tables. Admin only. Files contain sensitive academy information.", "نسخة SQLite كاملة تشمل الحسابات وجداول البوابة. للمدير فقط. الملف يحتوي على بيانات الأكاديمية الحساسة.") + '</p><p class="neg">' + tr("This preview stores data in this browser only. Import replaces its data; it does not synchronize devices.", "هذه المعاينة تحفظ البيانات داخل هذا المتصفح فقط. الاستيراد يستبدل بياناته ولا يزامن الأجهزة.") + '</p><div class="bar"><button type="button" class="b" id="database-export">' + tr("Export full backup", "تصدير نسخة كاملة") + "</button><label>" + tr("Choose backup (.json or .sqlite; up to 16 MiB database)", "اختيار نسخة (.json أو .sqlite؛ القاعدة بحد أقصى ١٦ ميجابايت)") + '<input type="file" id="database-file" accept=".json,.sqlite,.sqlite3,.db"></label><button type="button" class="b2" id="database-validate">' + tr("Validate & preview", "فحص ومعاينة") + '</button></div><p role="status" id="database-status"></p><div id="database-preview"></div><div id="database-history"></div>';
        view.append(section);
        const status = (message) => {
          section.querySelector("#database-status").textContent = message;
        };
        const act = (id, fn) => {
          section.querySelector(id).onclick = async () => {
            try {
              await fn();
            } catch (e) {
              status(e.message);
            }
          };
        };
        act("#database-export", async () => {
          const result = api("/export", {});
          await window.__APLUS_SAVE__?.();
          download(result.package, result.filename);
          status(tr("Full backup prepared. Keep it in a private location.", "تم تجهيز النسخة الكاملة. احتفظ بها في مكان خاص."));
          showHistory();
        });
        act("#database-validate", async () => {
          validation = null;
          packageData = null;
          const file = section.querySelector("#database-file").files[0];
          if (!file)
            throw Error(tr("Choose a backup first.", "اختر نسخة أولًا."));
          if (file.size > 24 * 1024 * 1024)
            throw Error(tr("File exceeds the preview limit.", "الملف يتجاوز حد المعاينة."));
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (new TextDecoder("latin1").decode(bytes.subarray(0, 15)) === "SQLite format 3") {
            let text = "";
            for (let i = 0;i < bytes.length; i += 32768)
              text += String.fromCharCode(...bytes.subarray(i, i + 32768));
            packageData = { format: "sqlite", database: btoa(text) };
          } else
            packageData = JSON.parse(new TextDecoder().decode(bytes));
          validation = api("/validate", packageData);
          const v = validation, keys = Object.keys(v.incoming.counts), rows = keys.map((k) => "<tr><td>" + esc(k) + "</td><td>" + esc(v.current.counts[k] ?? 0) + "</td><td>" + esc(v.incoming.counts[k]) + "</td></tr>").join("");
          section.querySelector("#database-preview").innerHTML = "<h3>" + tr("Validation preview — no active data changed", "نتيجة الفحص — لم تتغير البيانات الحالية") + "</h3><p>SHA-256: <code>" + esc(v.checksum) + "</code></p><p>" + tr("Schema", "الإصدار") + ": " + v.sourceVersion + " → " + v.targetVersion + "</p><ul>" + v.warnings.map((x) => "<li>" + esc(x) + "</li>").join("") + '</ul><div class="tw"><table><thead><tr><th>' + tr("Record", "السجل") + "</th><th>" + tr("Current", "الحالي") + "</th><th>" + tr("Imported", "المستورد") + "</th></tr></thead><tbody>" + rows + "</tbody></table></div><details><summary>" + tr("Financial verification by original currency", "التحقق المالي حسب العملة الأصلية") + '</summary><pre style="white-space:pre-wrap;max-height:300px;overflow:auto">' + esc(JSON.stringify({ current: v.current.currencies, incoming: v.incoming.currencies, teacherCurrent: v.current.teachers, teacherIncoming: v.incoming.teachers }, null, 2)) + "</pre></details>" + (v.needsMigration ? '<label><input type="checkbox" id="database-migration"> ' + tr("Approve upgrading only the staging copy", "أوافق على ترقية النسخة المؤقتة فقط") + "</label>" : "") + (v.needsAdmin ? "<fieldset><legend>" + tr("Legacy backup has no active Admin — provision one", "النسخة القديمة لا تحتوي على مدير نشط — أنشئ حسابًا") + "</legend><label>" + tr("Username", "اسم المستخدم") + '<input id="database-admin-user" autocomplete="off"></label><label>' + tr("Display name", "الاسم") + '<input id="database-admin-name"></label><label>' + tr("New password (12–200 characters)", "كلمة مرور جديدة (١٢–٢٠٠ حرف)") + '<input type="password" id="database-admin-password" autocomplete="new-password"></label></fieldset>' : "") + '<label><input type="checkbox" id="database-confirm"> ' + tr("I understand this REPLACES the destination. A verified safety copy will be saved first.", "أفهم أن هذا يستبدل بيانات الوجهة، وسيتم حفظ نسخة أمان متحقق منها أولًا.") + '</label><button type="button" class="b" id="database-import">' + tr("Import validated backup", "استيراد النسخة المفحوصة") + "</button>";
          status(tr("Validation passed. Review counts, amounts and warnings before confirming.", "نجح الفحص. راجع الأعداد والمبالغ والتنبيهات قبل التأكيد."));
          act("#database-import", async () => {
            if (!section.querySelector("#database-confirm").checked)
              throw Error(tr("Confirm replacement first.", "أكد الاستبدال أولًا."));
            const parameters = {
              validationId: v.validationId,
              confirm: true,
              replace: "REPLACE",
              allowMigration: !!section.querySelector("#database-migration")?.checked,
              administrator: v.needsAdmin ? { username: section.querySelector("#database-admin-user").value, display_name: section.querySelector("#database-admin-name").value, password: section.querySelector("#database-admin-password").value } : undefined
            };
            const button = section.querySelector("#database-import");
            button.disabled = true;
            status(tr("Saving verified safety backup and restoring… Keep this tab open.", "جارٍ حفظ نسخة الأمان والاسترجاع… اترك الصفحة مفتوحة."));
            try {
              const result = await window.__APLUS_RESTORE__(parameters);
              download(result.safetyPackage, result.safetyBackup.replace(".sqlite", ".aplus-backup.json"));
              status(tr("Restored and saved. Sign in again with an imported account.", "تم الاسترجاع والحفظ. سجل الدخول بحساب من النسخة المستوردة."));
              section.querySelector("#database-preview").innerHTML = '<a class="b" href="/">' + tr("Return to sign in", "العودة لتسجيل الدخول") + "</a>";
            } finally {
              button.disabled = false;
            }
          });
        });
        function showHistory() {
          const data = api("");
          const el = section.querySelector("#database-history");
          el.innerHTML = "<h3>" + tr("Available backups and restore history", "النسخ المتاحة وسجل الاسترجاع") + "</h3>" + data.backups.map((b) => "<p>" + esc(b.name) + ' <button type="button" class="b2" data-backup="' + esc(b.name) + '">' + tr("Download", "تنزيل") + "</button></p>").join("") + '<pre style="white-space:pre-wrap">' + esc(JSON.stringify(data.history, null, 2)) + "</pre>";
          el.querySelectorAll("[data-backup]").forEach((button) => button.onclick = () => {
            try {
              const r = api("/download", { name: button.dataset.backup });
              download(r.package, r.filename);
            } catch (e) {
              status(e.message);
            }
          });
        }
        showHistory();
      }
      new MutationObserver(attach).observe(document.getElementById("v"), { childList: true });
      new MutationObserver(() => {
        const section = document.getElementById("database-transfer");
        if (!section)
          return;
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          const raw = originalText.get(node) || node.nodeValue;
          const pair = labels.get(raw.trim());
          if (pair) {
            originalText.set(node, raw);
            node.nodeValue = raw.replace(raw.trim(), pair[document.documentElement.lang === "ar" ? "ar" : "en"]);
          }
        }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      document.addEventListener("click", (event) => {
        if (event.target.closest('[data-route="Settings"]'))
          setTimeout(attach, 0);
      });
      attach();
    }
    module.exports = { mount };
  });

  // secure-server/client.js
  window.__APLUS_SERVER__ = true;
  var token = () => document.querySelector("meta[name=aplus-token]")?.content || "";
  var transport = { dispatch(method, url, headers = {}, body) {
    if (!url.startsWith("/api/"))
      throw Error("Invalid API path");
    const x = new XMLHttpRequest;
    x.open(method, url, false);
    for (const [k, v] of Object.entries(headers))
      x.setRequestHeader(k, v);
    x.send(body ?? null);
    return { status: x.status, text: () => x.responseText };
  } };
  window.__APLUS_TRANSPORT__ = transport;
  window.__APLUS_SAVE__ = async () => {};
  window.__APLUS_RESTORE__ = async (parameters) => {
    const r = await fetch("/api/preview/backups/restore", { method: "POST", headers: { "content-type": "application/json", "x-aplus-token": token() }, body: JSON.stringify(parameters) }), data = await r.json();
    if (!r.ok)
      throw Error(data.error);
    return data;
  };
  var user = JSON.parse(transport.dispatch("GET", "/api/auth/status").text()).user;
  if (user) {
    require_ui().mount();
    require_backups_ui().mount();
    new MutationObserver(() => {
      const box = document.getElementById("database-transfer");
      if (box && !box.dataset.secureText) {
        box.dataset.secureText = "1";
        const p = box.querySelector("p.neg");
        if (p)
          p.textContent = document.documentElement.lang === "ar" ? "البيانات محفوظة على الخادم. استيراد البيانات الحقيقية مقفول لحين اجتياز تجربة الاسترجاع والموافقة." : "Data is stored on the server. Real-data migration stays locked until the restore rehearsal is approved.";
      }
    }).observe(document.getElementById("v"), { childList: true, subtree: true });
  }
})();

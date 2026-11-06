import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  appName: ["أكاديمية A+ Hub", "A+ Hub Academy"],
  tagline: ["إدارة الطلاب والمعلمين والحصص والجدول في مكان واحد", "Students, teachers, lessons and schedule in one place"],
  signIn: ["تسجيل الدخول", "Sign in"],
  signUp: ["إنشاء حساب", "Create account"],
  signOut: ["تسجيل الخروج", "Sign out"],
  email: ["البريد الإلكتروني", "Email"],
  password: ["كلمة المرور", "Password"],
  displayName: ["الاسم الظاهر", "Display name"],
  forgot: ["نسيت كلمة المرور؟", "Forgot password?"],
  sendReset: ["إرسال رابط إعادة التعيين", "Send reset link"],
  resetSent: ["أرسلنا رابط إعادة التعيين إلى بريدك.", "We sent a reset link to your email."],
  newPassword: ["كلمة مرور جديدة", "New password"],
  savePassword: ["حفظ كلمة المرور", "Save password"],
  checkEmail: ["تحقق من بريدك لتأكيد الحساب، ثم سجّل الدخول.", "Check your email to confirm your account, then sign in."],
  haveAccount: ["لديك حساب؟", "Have an account?"],
  noAccount: ["عضو جديد في الفريق؟", "New team member?"],
  back: ["رجوع", "Back"],
  openApp: ["الدخول إلى النظام", "Open the system"],
  waiting: ["حسابك بانتظار تفعيل المدير", "Your account is waiting for an administrator"],
  waitingBody: ["اطلب من مدير الأكاديمية منحك صلاحية من صفحة الفريق.", "Ask the academy administrator to give you access from the Team page."],
  dashboard: ["لوحة التحكم", "Dashboard"],
  students: ["الطلاب", "Students"],
  teachers: ["المعلمون", "Teachers"],
  subjects: ["المواد", "Subjects"],
  lessons: ["الحصص", "Lessons"],
  schedule: ["الجدول", "Schedule"],
  team: ["الفريق", "Team"],
  add: ["إضافة", "Add"],
  edit: ["تعديل", "Edit"],
  delete: ["حذف", "Delete"],
  save: ["حفظ", "Save"],
  cancel: ["إلغاء", "Cancel"],
  search: ["بحث…", "Search…"],
  confirmDelete: ["هل تريد حذف هذا السجل؟", "Delete this record?"],
  saved: ["تم الحفظ", "Saved"],
  deleted: ["تم الحذف", "Deleted"],
  empty: ["لا توجد سجلات بعد", "No records yet"],
  readOnly: ["عرض فقط", "View only"],
  name: ["الاسم", "Name"],
  phone: ["الهاتف", "Phone"],
  specialty: ["التخصص", "Specialty"],
  currency: ["العملة", "Currency"],
  hourlyRate: ["سعر الساعة", "Hourly rate"],
  status: ["الحالة", "Status"],
  notes: ["ملاحظات", "Notes"],
  university: ["الجامعة", "University"],
  country: ["الدولة", "Country"],
  major: ["التخصص الدراسي", "Major"],
  level: ["المستوى", "Level"],
  type: ["النوع", "Type"],
  teacher: ["المعلم", "Teacher"],
  student: ["الطالب", "Student"],
  subject: ["المادة", "Subject"],
  teacherRate: ["أجر المعلم / ساعة", "Teacher rate / hr"],
  teacherCurrency: ["عملة المعلم", "Teacher currency"],
  studentRate: ["سعر الطالب / ساعة", "Student rate / hr"],
  studentCurrency: ["عملة الطالب", "Student currency"],
  date: ["التاريخ", "Date"],
  hours: ["الساعات", "Hours"],
  start: ["البداية", "Start"],
  end: ["النهاية", "End"],
  recurring: ["أسبوعي متكرر", "Weekly recurring"],
  weekday: ["اليوم", "Day"],
  active: ["نشط", "Active"],
  inactive: ["غير نشط", "Inactive"],
  live: ["مباشر", "Live"],
  recorded: ["مسجّل", "Recorded"],
  project: ["مشروع", "Project"],
  completed: ["مكتملة", "Completed"],
  cancelled: ["ملغاة", "Cancelled"],
  rescheduled: ["مؤجلة", "Rescheduled"],
  no_show: ["غياب", "No show"],
  yes: ["نعم", "Yes"],
  no: ["لا", "No"],
  activeStudents: ["طلاب نشطون", "Active students"],
  activeTeachers: ["معلمون نشطون", "Active teachers"],
  lessonsMonth: ["حصص هذا الشهر", "Lessons this month"],
  hoursMonth: ["ساعات هذا الشهر", "Hours this month"],
  todaySchedule: ["جدول اليوم", "Today's schedule"],
  nothingToday: ["لا توجد مواعيد اليوم", "Nothing scheduled today"],
  recentLessons: ["أحدث الحصص", "Recent lessons"],
  thisWeek: ["هذا الأسبوع", "This week"],
  role: ["الصلاحية", "Role"],
  admin: ["مدير", "Administrator"],
  coordinator: ["منسق", "Coordinator"],
  accountant: ["محاسب", "Accountant"],
  noRole: ["بدون صلاحية", "No access"],
  linkedTeacher: ["المعلم المرتبط", "Linked teacher"],
  teamHelp: ["يسجّل كل عضو حسابه من صفحة الدخول، ثم تمنحه صلاحية هنا.", "Each member creates an account on the sign-in page, then you give them a role here."],
  adminOnly: ["هذه الصفحة للمدير فقط", "This page is for administrators only"],
  language: ["English", "العربية"],
  total: ["الإجمالي", "Total"],
  required: ["مطلوب", "Required"],
} as const;

export type TKey = keyof typeof dict;
export const WEEKDAYS: Record<Lang, string[]> = {
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };
const I18n = createContext<Ctx>({ lang: "ar", setLang: () => {}, t: (k) => dict[k][0] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    const saved = window.localStorage.getItem("aplus-lang");
    if (saved === "en" || saved === "ar") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = (l: Lang) => {
    window.localStorage.setItem("aplus-lang", l);
    setLangState(l);
  };
  const t = (k: TKey) => dict[k][lang === "ar" ? 0 : 1];
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);

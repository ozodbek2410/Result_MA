import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, 
  Trophy, 
  Users, 
  TrendingUp, 
  Award, 
  BookOpen,
  CheckCircle,
  ArrowRight,
  Menu,
  X,
  Phone,
  Mail,
  MapPin,
  Star,
  Sparkles,
  Target,
  Zap,
  Heart
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    grade: ''
  });

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    setShowModal(false);
    alert('Arizangiz qabul qilindi! Tez orada siz bilan bog\'lanamiz.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Math Academy
                </span>
                <span className="text-xs text-gray-500">Matematika maktabi</span>
              </div>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={() => scrollToSection('features')} className="text-gray-700 hover:text-blue-600 transition-colors font-medium">
                Afzalliklar
              </button>
              <button onClick={() => scrollToSection('programs')} className="text-gray-700 hover:text-blue-600 transition-colors font-medium">
                Yo'nalishlar
              </button>
              <button onClick={() => scrollToSection('results')} className="text-gray-700 hover:text-blue-600 transition-colors font-medium">
                Natijalar
              </button>
              <button onClick={() => scrollToSection('contact')} className="text-gray-700 hover:text-blue-600 transition-colors font-medium">
                Aloqa
              </button>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center space-x-3">
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium transition-colors hover:bg-blue-50 rounded-lg"
              >
                Kirish
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-shadow font-medium"
              >
                Qabulga yozilish
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-lg animate-slide-down">
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => scrollToSection('features')} className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                Afzalliklar
              </button>
              <button onClick={() => scrollToSection('programs')} className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                Yo'nalishlar
              </button>
              <button onClick={() => scrollToSection('results')} className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                Natijalar
              </button>
              <button onClick={() => scrollToSection('contact')} className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                Aloqa
              </button>
              <div className="pt-3 border-t border-gray-200 space-y-2">
                <button
                  onClick={() => navigate('/login')}
                  className="block w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                >
                  Kirish
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="block w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium"
                >
                  Qabulga yozilish
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>1–11-sinflar uchun zamonaviy matematika maktabi</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Matematikaga
                <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  ishtiyoq uyg'otamiz
                </span>
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed">
                Zamonaviy STEAM darslari, olimpiadaga tayyorgarlik, prezident maktabiga tayyorgarlik va tarbiyaviy muhit bir joyda.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setShowModal(true)}
                  className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-shadow font-semibold flex items-center justify-center space-x-2"
                >
                  <span>Qabulga yozilish</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scrollToSection('programs')}
                  className="px-8 py-4 bg-white text-gray-700 rounded-xl border-2 border-gray-200 hover:border-blue-600 hover:text-blue-600 transition-colors font-semibold"
                >
                  Yo'nalishlar bilan tanishish
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">200+</div>
                  <div className="text-sm text-gray-600 mt-1">Bitiruvchilar</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">20+</div>
                  <div className="text-sm text-gray-600 mt-1">Olimpiada g'oliblari</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-pink-600">10+</div>
                  <div className="text-sm text-gray-600 mt-1">Yillik tajriba</div>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative">
              <div className="relative z-10">
                <img
                  src="/landing/images/banner.png"
                  alt="Math Academy"
                  className="w-full h-auto rounded-2xl shadow-2xl"
                />
              </div>
              
              {/* Floating Cards */}
              <div className="absolute -top-6 -left-6 bg-white p-4 rounded-xl shadow-xl border border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Olimpiada</div>
                    <div className="text-xs text-gray-500">Tayyorgarlik</div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 -right-6 bg-white p-4 rounded-xl shadow-xl border border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">CRM tizimi</div>
                    <div className="text-xs text-gray-500">Onlayn nazorat</div>
                  </div>
                </div>
              </div>

              {/* Background Decoration */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-blue-200 to-purple-200 rounded-full blur-3xl opacity-20"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in-up">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4 animate-scale-in">
              <Star className="w-4 h-4" />
              <span>Nima uchun aynan Math Academy?</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Farzandingiz muvaffaqiyati uchun
              <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                eng yaxshi muhit
              </span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Biz darslarni faqat "formal" o'tmaymiz – har bir bolada matematik fikrlash va mustaqil o'rganish ko'nikmalarini shakllantiramiz.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-blue-100">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Users className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Yuqori malakali ustozlar</h3>
              <p className="text-gray-600 leading-relaxed">
                Respublika va xalqaro olimpiada tajribasiga ega o'qituvchilar, doimiy ravishda o'z ustida ishlaydigan jamoa.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-purple-100">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Target className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Raqamli nazorat va CRM</h3>
              <p className="text-gray-600 leading-relaxed">
                mathacademy.uz va CRM orqali davomati, natijalari va uy vazifalari ota-onaga doimiy ko'rinib turadi.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 bg-gradient-to-br from-pink-50 to-pink-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-pink-100">
              <div className="w-14 h-14 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Natijaga yo'naltirilgan tizim</h3>
              <p className="text-gray-600 leading-relaxed">
                Har oy diagnostik test, reyting, shaxsiy o'sish tahlili va keyingi oy uchun aniq rejalar.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 bg-gradient-to-br from-green-50 to-green-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-green-100">
              <div className="w-14 h-14 bg-gradient-to-br from-green-600 to-green-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Heart className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Individual yondashuv</h3>
              <p className="text-gray-600 leading-relaxed">
                Har bir o'quvchi uchun shaxsiy o'quv reja va doimiy monitoring. Kichik guruhlarda intensiv darslar.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group p-8 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-orange-100">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Zamonaviy dastur</h3>
              <p className="text-gray-600 leading-relaxed">
                STEAM metodikasi, interaktiv darslar va amaliy loyihalar orqali chuqur bilim berish.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group p-8 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl hover:shadow-xl transition-shadow border border-indigo-100">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Award className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Olimpiada tayyorgarlik</h3>
              <p className="text-gray-600 leading-relaxed">
                Mintaqaviy va xalqaro olimpiadalarga maxsus tayyorgarlik dasturlari va mentorlik.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section id="programs" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12">
            <div>
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
                <BookOpen className="w-4 h-4" />
                <span>Yo'nalishlar</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold text-gray-900">
                O'quv dasturlarimiz
              </h2>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 lg:mt-0 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-shadow font-medium"
            >
              Konsultatsiyaga yozilish
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Program 1 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">1–4-sinflar: Boshlang'ich matematika</h3>
              <p className="text-gray-600 mb-4">Matematikaga muhabbat uyg'otish va mustahkam poydevor yaratish.</p>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Mantiqiy masalalar va o'yinlar</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Tez hisoblash ko'nikmalari</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Diqqat va xotirani rivojlantirish</span>
                </li>
              </ul>
            </div>

            {/* Program 2 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Target className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">5–8-sinflar: Kuchli asos va tayyorgarlik</h3>
              <p className="text-gray-600 mb-4">Umumta'lim dasturi + chuqurlashtirilgan algebra va geometriya.</p>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">O'quv dasturini chuqur o'zlashtirish</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Har hafta onlayn testlar</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Qo'shimcha mustahkamlash darslari</span>
                </li>
              </ul>
            </div>

            {/* Program 3 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                <Trophy className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">9–11-sinflar: Olimpiada va oliygoh</h3>
              <p className="text-gray-600 mb-4">Oliy ta'lim va olimpiadalar uchun chuqur tayyorgarlik.</p>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-purple-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Oliy ta'lim test bloklari</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-purple-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Mintaqaviy va xalqaro olimpiadaga tayyorlov</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-purple-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Mentorlik va shaxsiy reja</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 lg:p-12 shadow-2xl">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                  Farzandingiz kelajagi uchun bugun qaror qabul qiling
                </h2>
                <p className="text-blue-100 text-lg">
                  Qabul suhbatiga yoziling, darajani aniqlash testi bepul o'tkaziladi va sizga mos o'quv dasturi tavsiya qilinadi.
                </p>
              </div>
              <div className="text-center lg:text-right">
                <button
                  onClick={() => setShowModal(true)}
                  className="px-8 py-4 bg-white text-blue-600 rounded-xl hover:shadow-2xl transition-shadow font-bold text-lg"
                >
                  Qabulga yozilish
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section id="results" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium mb-4">
              <Trophy className="w-4 h-4" />
              <span>Natijalarimiz</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              O'quvchilarimiz muvaffaqiyatlari
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Har yili o'quvchilarimiz respublika va xalqaro olimpiadalarda yuqori natijalar ko'rsatmoqda
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl">
              <div className="text-5xl font-bold text-blue-600 mb-2">200+</div>
              <div className="text-gray-700 font-medium">Bitiruvchilar</div>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl">
              <div className="text-5xl font-bold text-purple-600 mb-2">20+</div>
              <div className="text-gray-700 font-medium">Olimpiada g'oliblari</div>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl">
              <div className="text-5xl font-bold text-green-600 mb-2">95%</div>
              <div className="text-gray-700 font-medium">O'zlashtirish darajasi</div>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-pink-50 to-pink-100 rounded-2xl">
              <div className="text-5xl font-bold text-pink-600 mb-2">10+</div>
              <div className="text-gray-700 font-medium">Yillik tajriba</div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-sm font-medium mb-4">
              <MapPin className="w-4 h-4" />
              <span>Aloqa</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Biz bilan bog'laning
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Info */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Telefon</h3>
                    <p className="text-gray-600">+998 90 974 11 31</p>
                    <p className="text-gray-600">+998 91 648 49 12</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Email</h3>
                    <p className="text-gray-600">info@mathacademy.uz</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">Manzil</h3>
                    <p className="text-gray-600">Buxoro viloyati, G'ijduvon tumani, 2-son kasb-hunar maktabi</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3052.2454445378253!2d64.66316367551107!3d40.09224027532588!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3f5069d8abb8ccb7%3A0x1f13c80e1aaed70d!2sGijduvon%20tuman%202-son%20kasb-hunar%20maktabi!5e0!3m2!1sen!2s!4v1763363525407!5m2!1sen!2s"
                width="100%"
                height="400"
                style={{ border: 0, borderRadius: '12px' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold">Math Academy</span>
              </div>
              <p className="text-gray-400 text-sm">
                Matematikaga ixtisoslashgan xususiy maktab. Zamonaviy ta'lim, sharqona tarbiya va natijaga yo'naltirilgan o'quv dasturlari.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-4">Aloqa</h3>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  +998 90 974 11 31
                </li>
                <li className="flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  +998 91 648 49 12
                </li>
                <li className="flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  info@mathacademy.uz
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4">Ijtimoiy tarmoqlar</h3>
              <div className="flex space-x-4">
                <a href="https://t.me/mathacademy_ps" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
                  </svg>
                </a>
                <a href="https://www.instagram.com/mathacademyuz" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-pink-600 transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2025 Math Academy. Barcha huquqlar himoyalangan.</p>
          </div>
        </div>
      </footer>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Qabulga yozilish</h3>
              <p className="text-gray-600 text-sm mt-2">Ma'lumotlaringizni qoldiring, biz siz bilan bog'lanamiz</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To'liq ism
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                  placeholder="Ism familiyangiz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefon raqam
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                  placeholder="+998 90 123 45 67"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sinf
                </label>
                <select
                  required
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                >
                  <option value="">Sinfni tanlang</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}-sinf
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-shadow font-semibold mt-6"
              >
                Yuborish
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

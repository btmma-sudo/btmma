export type ThemeName = "flame" | "wellness";

export type NavItem = {
  label: string;
  href: string;
};

export type HeroContent = {
  title: string;
  image: string;
  imageAlt?: string;
  overlay?: "medium" | "strong";
};

export type GalleryImage = {
  src: string;
  alt: string;
};

export type LeadFormConfig = {
  title: string;
  intro: string;
  defaultProgram?: string;
  submitLabel?: string;
  webhookPath?: string;
  hideProgramSelect?: boolean;
  fields?: "standard" | "emailOnly";
};

export type SEOData = {
  title: string;
  description: string;
  keywords: string[];
};

export type ProgramCard = {
  title: string;
  href: string;
  summary: string;
  eyebrow: string;
  image?: string;
  imageAlt?: string;
};

export type SeoCopy = {
  tagline: string;
  intro: string;
  bulletHeading: string;
  bullets: string[];
  closing: string;
};

export type ProgramVariant = {
  label: string;
  audience: string;
  programInterest?: string;
  curriculum: {
    title: string;
    copy: string;
  };
  benefits: {
    title: string;
    items: string[];
  };
  galleryImages: GalleryImage[];
  seoCopy?: SeoCopy;
};

export type ProgramPage = {
  slug: string;
  seo: SEOData;
  hero: HeroContent;
  audience: string;
  curriculum: {
    title: string;
    copy: string;
  };
  benefits: {
    title: string;
    items: string[];
  };
  galleryImages: GalleryImage[];
  leadForm: LeadFormConfig;
  accentTheme?: ThemeName;
  showTestimonials?: boolean;
  showSchedule?: boolean;
  showLeadForm?: boolean;
  mobileCta?: string;
  seoCopy?: SeoCopy;
  variants?: ProgramVariant[];
};

export type SupportingPage = {
  slug: string;
  seo: SEOData;
  hero: HeroContent;
};

// ─── Site config ──────────────────────────────────────────────────────────────

export const site = {
  name: "Burning Tree Mixed Martial Arts",
  shortName: "Burning Tree MMA",
  phone: "202-368-4395",
  phoneHref: "2023684395",
  email: "info@burningtreemma.com",
  addressLine1: "10210 S Dolfield Rd",
  city: "Owings Mills",
  region: "MD",
  regionName: "Maryland",
  postalCode: "21117",
  country: "US",
  mapUrl:
    "https://www.google.com/maps?q=10210%20S%20Dolfield%20Rd%20Owings%20Mills%20MD%2021117",
  mapEmbedUrl:
    "https://www.google.com/maps?q=10210%20S%20Dolfield%20Rd%20Owings%20Mills%20MD%2021117&output=embed",
  primaryDomain: "https://www.burningtreemma.com",
  tagline: "Burning Tree MMA: Keepers of the Flame",
  latitude: 39.4120992,
  longitude: -76.7795037,
  serviceArea: "Baltimore County",
  hours: [
    "Monday - Thursday: 5:00 PM - 9:00 PM",
    "Saturday: 9:30 AM - 11:30 AM",
    "Sunday: Closed"
  ],
  schemaHours: [
    {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
      opens: "17:00",
      closes: "21:00"
    },
    {
      days: ["Saturday"],
      opens: "09:30",
      closes: "11:30"
    }
  ],
  social: {
    instagram: "https://www.instagram.com/burningtree_mma/",
    facebook: "https://www.facebook.com/burningtreemma"
  },
  themes: {
    flame: {
      bodyClass: "theme-flame"
    },
    wellness: {
      bodyClass: "theme-wellness"
    }
  }
};

// ─── Shared keyword base ───────────────────────────────────────────────────────

export const categoryKeywords = [
  "martial arts",
  "martial arts school",
  "martial arts academy",
  "self-defense",
  "martial arts classes",
  "martial arts training",
  "self-defence classes",
  "self-defence training",
  "karate classes",
  "muay thai classes",
  "martial arts for kids",
  "martial arts for adults",
  "martial arts for beginners",
  "karate for kids",
  "karate for adults",
  "karate for beginners",
  "muay thai for kids",
  "muay thai for adults",
  "muay thai for beginners"
];

// ─── Lead form options ─────────────────────────────────────────────────────────

export const programInterestOptions = [
  "Jr. Kenpo",
  "Adult Karate",
  "Muay Thai",
  "Jr. Muay Thai",
  "Wing Chun",
  "Jr. Wing Chun",
  "Women's Defense"
];

// ─── Navigation ────────────────────────────────────────────────────────────────

export const primaryPrograms: NavItem[] = [
  { label: "Kenpo Karate", href: "/kenpo-karate" },
  { label: "Muay Thai", href: "/muay-thai" },
  { label: "Wing Chun", href: "/wing-chun" },
  { label: "Women's Defense", href: "/womens-defense" }
];

export const secondaryNav: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "ChimpmanGi", href: "/chimpman-gi" }
];

// ─── Homepage program cards ────────────────────────────────────────────────────

export const homepagePrograms: ProgramCard[] = [
  {
    eyebrow: "Art of Eight Limbs",
    title: "Muay Thai",
    href: "/muay-thai",
    image: "/images/muay-thai-gallery-1.jpg",
    imageAlt: "Two Muay Thai students in full protective gear practicing a kick technique during class",
    summary: "The Art of Eight Limbs, The Path to Power and Precision."
  },
  {
    eyebrow: "American Kenpo",
    title: "Kenpo Karate",
    href: "/kenpo-karate",
    image: "/images/jr-kenpo-gallery-1.jpg",
    imageAlt: "Jr. Kenpo students in black gis with yellow belts sitting with their instructor at a tournament",
    summary: "Traditional Kenpo for kids and adults. Discipline, self-defense, and real progression."
  },
  {
    eyebrow: "Wing Chun",
    title: "Wing Chun",
    href: "/wing-chun",
    image: "/images/wing-chun-gallery-1.jpg",
    imageAlt: "Wing Chun students practicing centerline striking technique at Burning Tree MMA",
    summary: "The traditional Chinese martial art of Ip Man and Bruce Lee. Close-quarters combat built on precision, not power."
  },
  {
    eyebrow: "Sanuces Ryu Jiu-Jitsu",
    title: "Women's Defense",
    href: "/womens-defense",
    image: "/images/womens-defense-hero.jpg",
    imageAlt: "Women's self-defense class at Burning Tree MMA in Owings Mills",
    summary: "Real-world self-defense for real-world situations. Practical, powerful, and built for women."
  },
  {
    eyebrow: "Health & Wellness",
    title: "Health and Wellness",
    href: "/health-and-wellness",
    image: "/images/health-and-wellness-gallery-1.jpg",
    imageAlt: "Burning Tree MMA wellness room with a massage table, massage chair, and artwork on the walls",
    summary: "A wellness track built around sustainable support, recovery, and clean, aligned living."
  },
  {
    eyebrow: "Events",
    title: "Birthday Parties",
    href: "/birthday-parties",
    image: "/images/birthday-parties-gallery-1.jpg",
    imageAlt: "Instructor leading children in a foam sword activity at a martial arts birthday party",
    summary: "An unforgettable martial arts celebration full of fun, confidence, and movement."
  }
];

// ─── Supporting pages ──────────────────────────────────────────────────────────

export const homePage: {
  seo: SEOData;
  hero: HeroContent;
  leadForm: LeadFormConfig;
} = {
  seo: {
    title: "Martial Arts Classes in Owings Mills | Burning Tree MMA",
    description:
      "Burning Tree MMA offers Jr. Kenpo, Adult Karate, Muay Thai, Wing Chun, birthday parties, and wellness services in Owings Mills.",
    keywords: [
      ...categoryKeywords,
      "MMA Owings Mills",
      "Jr. Kenpo Owings Mills",
      "adult karate Owings Mills",
      "Muay Thai Owings Mills",
      "Wing Chun Owings Mills",
      "karate classes near me",
      "world-class instructors",
      "safe and structured environment"
    ]
  },
  hero: {
    title: "Burning Tree MMA: Keepers of the flame",
    image: "/images/adult-martial-arts-hero.jpg",
    imageAlt: "Large group of Burning Tree MMA adult students and instructors posing together on the gym mat",
    overlay: "strong"
  },
  leadForm: {
    title: "Try a Free Class",
    intro: "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit"
  }
};

export const aboutPage: SupportingPage & {
  leadForm: LeadFormConfig;
} = {
  slug: "about",
  seo: {
    title: "About Burning Tree MMA | Owings Mills Martial Arts School",
    description:
      "Learn about Burning Tree MMA, our school philosophy, instructor team, and the martial arts culture we are building in Owings Mills.",
    keywords: [
      ...categoryKeywords,
      "Burning Tree MMA",
      "martial arts academy Maryland",
      "Owings Mills martial arts school"
    ]
  },
  hero: {
    title: "About Burning Tree MMA",
    image: "/images/about-hero.jpg",
    imageAlt: "The Burning Tree MMA training mat with mirrors, awards, and gym equipment in the background",
    overlay: "medium"
  },
  leadForm: {
    title: "Try a Free Class",
    intro: "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit"
  }
};

export const faqPage: SupportingPage & {
  faqs: { question: string; answer: string }[];
  leadForm: LeadFormConfig;
} = {
  slug: "faq",
  seo: {
    title: "FAQ | Burning Tree MMA Owings Mills",
    description:
      "Find answers about classes, schedules, gear, contact information, and getting started at Burning Tree MMA in Owings Mills.",
    keywords: [
      ...categoryKeywords,
      "martial arts FAQ",
      "Owings Mills martial arts",
      "Burning Tree MMA contact"
    ]
  },
  hero: {
    title: "FAQ",
    image: "/images/faq-hero.jpg",
    imageAlt: "Martial arts students practicing technique during live training with an American flag in the background",
    overlay: "medium"
  },
  faqs: [
    {
      question: "Do I need experience before starting martial arts classes?",
      answer:
        "No. Burning Tree MMA welcomes complete beginners in both kids and adult programs and helps students start at the right pace."
    },
    {
      question: "What should I bring to my first class?",
      answer:
        "Bring comfortable workout clothes, water, and a willingness to learn. We will guide you on uniforms and gear after you contact us."
    },
    {
      question: "Do you offer classes for kids and adults?",
      answer:
        "Yes. We offer Jr. Kenpo, Adult Karate, Muay Thai, Wing Chun, birthday parties, and wellness-oriented services."
    },
    {
      question: "Where is Burning Tree MMA located?",
      answer:
        "We are located at 10210 S Dolfield Rd in Owings Mills, Maryland, serving local families and adults looking for martial arts classes near them."
    }
  ],
  leadForm: {
    title: "Try a Free Class",
    intro: "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit"
  }
};

// ─── Program pages ─────────────────────────────────────────────────────────────

export const programPages: ProgramPage[] = [
  // ── Muay Thai (Kids / Adults variant) ───────────────────────────────────────
  {
    slug: "muay-thai",
    seo: {
      title: "Muay Thai in Owings Mills | Burning Tree MMA",
      description:
        "Muay Thai classes in Owings Mills with pad drills, clinch technique, combinations, conditioning, and real striking coaching.",
      keywords: [
        ...categoryKeywords,
        "Muay Thai Owings Mills",
        "Muay Thai classes near me",
        "art of eight limbs",
        "kickboxing classes near me",
        "elbow and knee strikes"
      ]
    },
    hero: {
      title: "Muay Thai",
      image: "/images/muay-thai-hero.jpg",
      imageAlt: "The Burning Tree MMA training mat with a heavy bag, award displays, and mirrors along the walls",
      overlay: "strong"
    },
    audience: "",
    curriculum: { title: "", copy: "" },
    benefits: { title: "", items: [] },
    galleryImages: [],
    leadForm: {
      title: "Try a Free Class",
      intro: "Take the first step today, we will reach out to follow up with you",
      submitLabel: "Submit"
    },
    variants: [
      {
        label: "Kids",
        programInterest: "Jr. Muay Thai",
        audience: "Kids & Teens",
        curriculum: {
          title: "Striking fundamentals built for young athletes.",
          copy: "Jr. Muay Thai introduces kids and teens to the art of eight limbs in a safe, structured, and age-appropriate environment. Students develop punching and kicking technique, footwork, and pad work through drills and partner exercises that build coordination, discipline, and real striking ability. Classes are designed to challenge students at every level while keeping training fun and confidence-building."
        },
        benefits: {
          title: "What young students gain",
          items: [
            "Striking fundamentals, coordination, and athletic development through disciplined Muay Thai training.",
            "Confidence and self-defense awareness built through structured partner drills and pad work.",
            "A healthy, active outlet that builds focus, perseverance, and physical fitness."
          ]
        },
        galleryImages: [
          { src: "/images/jr-muay-thai-gallery-1.jpg", alt: "Jr. Muay Thai students training at Burning Tree MMA" },
          { src: "/images/jr-muay-thai-gallery-2.jpg", alt: "Young student practicing Muay Thai striking technique at Burning Tree MMA" },
          { src: "/images/jr-muay-thai-gallery-3.jpg", alt: "Jr. Muay Thai class at Burning Tree MMA in Owings Mills" }
        ],
        seoCopy: {
          tagline: "The Same Art That Builds Champions. Sized Right for Kids.",
          intro: "Muay Thai is one of the most effective striking arts in the world. Jr. Muay Thai brings those same fundamentals to younger students in a structured, age-appropriate format that builds real skills without shortcuts.",
          bulletHeading: "What kids develop in Jr. Muay Thai:",
          bullets: [
            "Punching, kicking, and footwork fundamentals",
            "Coordination and full-body athleticism",
            "Discipline and focus through structured pad work",
            "Confidence and self-defense awareness",
            "A bully prevention foundation built on real striking ability"
          ],
          closing: "Kids who train Muay Thai carry themselves differently. The confidence, coordination, and discipline they build on the mats show up everywhere else in their lives."
        }
      },
      {
        label: "Adults",
        programInterest: "Muay Thai",
        audience: "Teens & Adults",
        curriculum: {
          title: "The art of eight limbs with steady skill-building.",
          copy: "Known as the art of eight limbs, Muay Thai combines punches, kicks, knees, and elbows for an intense full-body workout. Students practice striking, pad drills, and clinch techniques that build endurance, power, and precision. Whether for fitness, self-defense, or competition, Muay Thai develops both physical toughness and mental confidence."
        },
        benefits: {
          title: "Why students love Muay Thai",
          items: [
            "Technical striking built on the art of eight limbs and disciplined coaching habits.",
            "Challenging classes that improve conditioning, coordination, and confidence.",
            "A motivating environment for beginners, returning students, and experienced strikers."
          ]
        },
        galleryImages: [
          { src: "/images/muay-thai-gallery-1.jpg", alt: "Two Muay Thai students in full protective headgear and shin guards practicing a kick technique during class" },
          { src: "/images/muay-thai-gallery-2.jpg", alt: "An instructor demonstrating a wrist control technique to students in the gym with framed awards on the wall" },
          { src: "/images/muay-thai-gallery-3.jpg", alt: "Two men in black training clothes practicing a striking combination in the gym, black and white photo" }
        ],
        seoCopy: {
          tagline: "Eight Limbs. Zero Boredom. Real Results.",
          intro: "Muay Thai is the most complete striking art in the world, and training it will push you harder than anything you have done in a gym.",
          bulletHeading: "What you develop in Muay Thai:",
          bullets: [
            "Striking technique using punches, kicks, elbows, and knees",
            "Full-body conditioning and explosive power",
            "Weight loss and lean muscle through high-output training",
            "Confidence and self-defense awareness built into every session",
            "Skill progression from beginner combinations to advanced clinch work"
          ],
          closing: "It does not feel like working out. It feels like learning something. That is the reason students show up consistently, stay accountable, and get results that a treadmill never produced."
        }
      }
    ]
  },

  // ── Kenpo Karate (Kids / Adults variant) ────────────────────────────────────
  {
    slug: "kenpo-karate",
    seo: {
      title: "Kenpo Karate in Owings Mills | Burning Tree MMA",
      description:
        "Kenpo Karate classes for kids and adults in Owings Mills. Jr. Kenpo builds confidence and discipline in children while Adult Kenpo delivers real self-defense, fitness, and belt progression.",
      keywords: [
        ...categoryKeywords,
        "Kenpo Karate Owings Mills",
        "Jr. Kenpo",
        "adult karate",
        "kids karate classes near me",
        "adult self-defense",
        "karate for kids",
        "karate for adults"
      ]
    },
    hero: {
      title: "Kenpo Karate",
      image: "/images/karate-hero.jpg",
      imageAlt: "Karate students training at Burning Tree MMA in Owings Mills",
      overlay: "strong"
    },
    audience: "",
    curriculum: { title: "", copy: "" },
    benefits: { title: "", items: [] },
    galleryImages: [],
    leadForm: {
      title: "Try a Free Class",
      intro: "Take the first step today, we will reach out to follow up with you",
      submitLabel: "Submit"
    },
    variants: [
      {
        label: "Kids",
        programInterest: "Jr. Kenpo",
        audience: "Ages 5–12",
        curriculum: {
          title: "A structured Jr. Kenpo path with real progression.",
          copy: "Our Kids Karate program blends fun and discipline to help children develop focus, respect, and self-control. Through structured drills, games, and partner work, students build confidence while learning real self-defense skills in a safe, supportive environment. Parents love seeing their kids grow stronger both on the mats and in school."
        },
        benefits: {
          title: "Why families choose this program",
          items: [
            "Confidence, focus, and communication skills that support success at school and at home.",
            "Healthy routines, coordination, and safe self-defense practice in a structured martial arts academy.",
            "A positive culture that reinforces discipline, humility, perseverance, and respect."
          ]
        },
        galleryImages: [
          { src: "/images/jr-kenpo-gallery-1.jpg", alt: "Two Jr. Kenpo students in black gis with yellow belts sitting with their instructor at a tournament, all smiling" },
          { src: "/images/jr-kenpo-gallery-2.jpg", alt: "A junior student practicing striking technique with a younger classmate in the Burning Tree MMA gym" },
          { src: "/images/jr-kenpo-gallery-3.jpg", alt: "A young Jr. Kenpo student in a black gi with yellow belt proudly holding up two medals at the DC Youth Classics competition" }
        ],
        seoCopy: {
          tagline: "Your Kid Will Be Different After 30 Days. In the Best Way.",
          intro: "Jr. Kenpo is not babysitting with kicks. It is a structured martial arts program that builds real skills, real discipline, and real confidence in kids who are still figuring out who they are.",
          bulletHeading: "What they gain on the mat:",
          bullets: [
            "Self-defense awareness they can actually use",
            "Focus and discipline that carries into school",
            "Confidence to stand up for themselves without aggression",
            "Belt rank progression that teaches goal-setting and follow-through",
            "A positive community of peers and coaches who hold them accountable"
          ],
          closing: "Most parents sign up for the self-defense. They stay because their kid stopped backing down from hard things."
        }
      },
      {
        label: "Adults",
        programInterest: "Adult Karate",
        audience: "Teens & Adults",
        curriculum: {
          title: "Technical training with clear progression.",
          copy: "Adult Karate provides a balance of traditional training and practical application. Students sharpen striking techniques, forms, and self-defense while enjoying a full-body workout that relieves stress and improves fitness. It is an empowering way to challenge yourself mentally and physically while progressing through belt ranks."
        },
        benefits: {
          title: "What adult students gain",
          items: [
            "Useful self-defense skills paired with stress relief and full-body conditioning.",
            "A clear progression path with technical coaching, accountability, and steady growth.",
            "A welcoming martial arts school culture for beginners and experienced students alike."
          ]
        },
        galleryImages: [
          { src: "/images/adult-martial-arts-gallery-1.jpg", alt: "Two adult students in black gis practicing a grappling control technique together while the full class trains in the background" },
          { src: "/images/adult-martial-arts-gallery-2.jpg", alt: "An instructor demonstrating a palm strike technique on a student during a martial arts seminar with a group of students watching" },
          { src: "/images/adult-martial-arts-gallery-3.jpg", alt: "Two adult students practicing hand-blocking techniques face to face with multiple training pairs visible in the background" }
        ],
        seoCopy: {
          tagline: "You Do Not Need to Be Fit to Start. You Will Be Fit Because You Started.",
          intro: "Adult Karate at Burning Tree MMA is the program for people who want a real challenge, a transferable skill, and a reason to show up consistently.",
          bulletHeading: "What you build in this program:",
          bullets: [
            "Practical self-defense skills rooted in American Kenpo",
            "Full-body strength and conditioning through technique-driven training",
            "Stress relief that actually works",
            "Accountability through belt rank progression and coaching",
            "Weight loss and fitness results without the monotony of a standard gym"
          ],
          closing: "Complete beginners. People returning after years off. Adults who are bored with the gym and want something that demands more from them."
        }
      }
    ]
  },

  // ── Wing Chun (Kids / Adults variant) ───────────────────────────────────────
  {
    slug: "wing-chun",
    seo: {
      title: "Wing Chun in Owings Mills | Burning Tree MMA",
      description:
        "Wing Chun classes in Owings Mills. Learn the traditional martial art of Ip Man and Bruce Lee. Close-quarters combat, self-defense, and precision-based striking every Wednesday.",
      keywords: [
        ...categoryKeywords,
        "Wing Chun Owings Mills",
        "Wing Chun classes near me",
        "Ip Man martial art",
        "close quarters combat",
        "traditional Chinese martial arts",
        "self-defense adults"
      ]
    },
    hero: {
      title: "Wing Chun",
      image: "/images/wing-chun-hero.jpg",
      imageAlt: "Wing Chun students practicing centerline striking technique at Burning Tree MMA",
      overlay: "strong"
    },
    audience: "",
    curriculum: { title: "", copy: "" },
    benefits: { title: "", items: [] },
    galleryImages: [],
    leadForm: {
      title: "Try a Free Class",
      intro: "Take the first step today, we will reach out to follow up with you",
      submitLabel: "Submit"
    },
    variants: [
      {
        label: "Kids",
        programInterest: "Jr. Wing Chun",
        audience: "Kids & Teens",
        curriculum: {
          title: "Traditional technique for young, sharp minds.",
          copy: "Jr. Wing Chun introduces kids and teens to one of the most intelligent martial arts systems in the world. Students learn centerline theory, economy of motion, and the simultaneous defense and attack principles that make Wing Chun uniquely effective for smaller and younger practitioners. Classes combine structured drilling, partner work, and progressive technique to build focus, precision, and real self-defense confidence."
        },
        benefits: {
          title: "What young students gain",
          items: [
            "Precision, focus, and structural body mechanics through traditional Wing Chun training.",
            "Self-defense skills built on technique and intelligence rather than size or strength.",
            "Discipline, patience, and goal-setting through a structured progression path."
          ]
        },
        galleryImages: [
          { src: "/images/jr-wing-chun-gallery-1.jpg", alt: "Jr. Wing Chun students training at Burning Tree MMA" },
          { src: "/images/jr-wing-chun-gallery-2.jpg", alt: "Young student practicing Wing Chun technique at Burning Tree MMA" },
          { src: "/images/jr-wing-chun-gallery-3.jpg", alt: "Jr. Wing Chun class at Burning Tree MMA in Owings Mills" }
        ],
        seoCopy: {
          tagline: "The Martial Art That Teaches Kids to Fight Smarter, Not Harder.",
          intro: "Wing Chun does not reward size or aggression. It rewards focus, precision, and intelligent technique, which makes it one of the best martial arts for kids who are still growing into their bodies.",
          bulletHeading: "What Jr. Wing Chun develops:",
          bullets: [
            "Centerline awareness and structural self-defense technique",
            "Simultaneous attack and defense: block and strike in the same motion",
            "Precision and economy of motion over brute force",
            "Focus and discipline through progressive drilling",
            "Confidence and bully prevention grounded in real skill"
          ],
          closing: "Kids who train Wing Chun learn that skill beats strength. That lesson carries far beyond the mat."
        }
      },
      {
        label: "Adults",
        programInterest: "Wing Chun",
        audience: "Teens & Adults",
        curriculum: {
          title: "The science of close-quarters combat.",
          copy: "Wing Chun is a traditional, concept-based Southern Chinese martial art built for efficiency, self-defense, and close-quarters combat. Students learn to protect and attack the centerline simultaneously, redirect force rather than absorb it, and deliver fast, direct strikes with minimal wasted motion. Made famous by Grandmaster Ip Man and his student Bruce Lee, Wing Chun is a system that rewards intelligence and technique over size and strength."
        },
        benefits: {
          title: "Core principles students master",
          items: [
            "Centerline Theory: protect your vital targets while attacking your opponent's in the same motion.",
            "Economy of Motion: direct, efficient striking and footwork with nothing wasted.",
            "Deflection over force: redirect an attacker's energy rather than meeting it head-on."
          ]
        },
        galleryImages: [
          { src: "/images/wing-chun-gallery-1.jpg", alt: "Wing Chun students practicing simultaneous block and strike technique at Burning Tree MMA" },
          { src: "/images/wing-chun-gallery-2.jpg", alt: "Instructor demonstrating centerline control during Wing Chun class at Burning Tree MMA" },
          { src: "/images/wing-chun-gallery-3.jpg", alt: "Wing Chun students drilling chain punches and close-range striking combinations" }
        ],
        seoCopy: {
          tagline: "The Martial Art Built for People Who Fight Smart, Not Big.",
          intro: "Wing Chun does not ask how strong you are. It asks how precisely you can move, how efficiently you can strike, and how quickly you can redirect what comes at you.",
          bulletHeading: "What Wing Chun develops:",
          bullets: [
            "Close-quarters self-defense designed for real-world situations",
            "Simultaneous attack and defense: block and strike in the same motion",
            "Centerline control and structural body mechanics",
            "Economy of motion: direct, efficient technique with nothing wasted",
            "The ability to redirect an attacker's force instead of absorbing it"
          ],
          closing: "This is the system that shaped Bruce Lee. Developed for practicality, refined over centuries, and now taught at Burning Tree MMA every Wednesday. If you want a martial art built on intelligence, precision, and adaptability, Wing Chun is it."
        }
      }
    ]
  },

  // ── Women's Defense ──────────────────────────────────────────────────────────
  {
    slug: "womens-defense",
    seo: {
      title: "Women's Self-Defense in Owings Mills | Burning Tree MMA",
      description:
        "Women's self-defense classes in Owings Mills using Sanuces Ryu Jiu-Jitsu. Learn practical techniques for real-world situations including bear hugs, chokes, hair pulling, and ground defense.",
      keywords: [
        ...categoryKeywords,
        "women's self-defense Owings Mills",
        "women's self-defense classes near me",
        "Sanuces Ryu Jiu-Jitsu",
        "self-defense for women Maryland",
        "real world self-defense",
        "women's safety classes"
      ]
    },
    hero: {
      title: "Women's Defense",
      image: "/images/womens-defense-hero.jpg",
      imageAlt: "Women's self-defense class at Burning Tree MMA in Owings Mills",
      overlay: "strong"
    },
    audience: "Women",
    curriculum: {
      title: "Real-world self-defense for real-world situations.",
      copy:
        "This program is built around the threats women actually face. Not hypothetical scenarios, but the real attacks that happen in everyday life. Every technique is practical, every drill is pressure-tested, and every session builds the physical skill and mental readiness to respond when it matters.\n\n- Defense against bear hugs\n- Defense against hair pulling\n- Defense against choking\n- Defense against wall attacks\n- Defense against ground assaults\n- Situational, environmental, and anatomy awareness"
    },
    benefits: {
      title: "What you take away from this program",
      items: [
        "Practical techniques that work under real pressure, not choreographed gym moves.",
        "Situational awareness training that helps you recognize and avoid danger before it escalates.",
        "Confidence grounded in real skill, so you carry yourself differently every day."
      ]
    },
    galleryImages: [
      { src: "/images/womens-defense-gallery-1.jpeg", alt: "Women's self-defense class drilling escape technique at Burning Tree MMA" },
      { src: "/images/womens-defense-gallery-2.jpeg", alt: "Instructor demonstrating a defense technique during Women's Defense class at Burning Tree MMA" },
      { src: "/images/womens-defense-gallery-3.jpeg", alt: "Women's self-defense students practicing ground defense at Burning Tree MMA in Owings Mills" }
    ],
    leadForm: {
      title: "Join a Women's Defense Class",
      intro: "Take the first step today. We will reach out to follow up with you.",
      submitLabel: "Submit",
      defaultProgram: "Women's Defense"
    },
    seoCopy: {
      tagline: "The System Built to Protect. Sanuces Ryu Jiu-Jitsu.",
      intro: "Sanuces Ryu Jiu-Jitsu is a close-quarters combat system developed by Dr. Moses Powell and designed specifically for real-world self-defense. Unlike sport-based martial arts, Sanuces is not built for competition. It is built for survival. Every technique is designed to work against a larger, stronger attacker in unpredictable environments. It teaches practitioners to neutralize threats quickly and decisively using joint manipulation, pressure points, throws, and ground control.",
      bulletHeading: "What makes Sanuces different:",
      bullets: [
        "Developed by Dr. Moses Powell specifically for real-world self-defense, not sport",
        "Techniques designed to work against larger and stronger attackers",
        "Close-quarters focus that applies directly to the situations women face most",
        "Combines joint manipulation, pressure points, throws, and ground control",
        "Taught here by Hanshi Daryl King, 10th Dan and Chief Instructor of all KNS Schools of Sanuces Ryu Jiu-Jitsu"
      ],
      closing: "Most self-defense courses teach women to survive an attack. This one teaches them to end it. If you want training that is honest about the threat and serious about the solution, this is where you start."
    }
  },

  // ── Birthday Parties ─────────────────────────────────────────────────────────
  {
    slug: "birthday-parties",
    seo: {
      title: "Birthday Parties in Owings Mills | Burning Tree MMA",
      description:
        "Plan an active martial arts birthday party in Owings Mills with Burning Tree MMA for memorable events and guided activities.",
      keywords: [
        "martial arts birthday parties",
        "kids party Owings Mills",
        "birthday entertainment",
        "martial arts events"
      ]
    },
    hero: {
      title: "Birthday Parties",
      image: "/images/birthday-parties-hero.jpg",
      imageAlt: "Instructor presenting a certificate to a child at a martial arts birthday party while other kids watch seated on the mat",
      overlay: "medium"
    },
    audience: "Families",
    curriculum: {
      title: "An event built around fun and movement.",
      copy:
        "The Birthday Party Program at Burning Tree MMA in Owings Mills combines fun, fitness, and focus for an unforgettable celebration. Kids take part in exciting martial arts games, team challenges, and beginner-friendly lessons that build confidence, coordination, and respect. Whether it is their first time trying martial arts or they are already training, every child leaves smiling, energized, and proud of what they accomplished."
    },
    benefits: {
      title: "What families can expect",
      items: [
        "Guided activities that keep the whole event moving.",
        "A safe environment with energetic coaching and structured fun.",
        "A memorable birthday experience that feels different from the usual options."
      ]
    },
    galleryImages: [
      { src: "/images/birthday-parties-gallery-1.jpg", alt: "Instructor leading a group of children in a foam sword activity at a martial arts birthday party with a ninja-themed Happy Birthday banner" },
      { src: "/images/birthday-parties-gallery-2.jpg", alt: "Instructor presenting a certificate to a child at a birthday party while other guests sit and watch on the mat" },
      { src: "/images/birthday-parties-gallery-3.jpg", alt: "Instructor standing in a circle of seated children leading a birthday party activity in the Burning Tree MMA gym" }
    ],
    showTestimonials: false,
    showSchedule: false,
    mobileCta: "Contact Us",
    leadForm: {
      title: "Ask About Birthday Parties",
      intro: "Tell us your preferred date, age group, and party goals and we will follow up with details.",
      defaultProgram: "Birthday Parties",
      hideProgramSelect: true
    }
  },

  // ── ChimpmanGi ───────────────────────────────────────────────────────────────
  {
    slug: "chimpman-gi",
    seo: {
      title: "ChimpmanGi Drop Sign Up | Burning Tree MMA",
      description:
        "Join the Burning Tree MMA ChimpmanGi drop list to hear when the next custom gi release becomes available.",
      keywords: [
        "ChimpmanGi",
        "custom gi drop",
        "Burning Tree gi",
        "martial arts apparel"
      ]
    },
    hero: {
      title: "Home of the best Gi",
      image: "/images/chimpman-gi-hero.jpg",
      imageAlt: "BJJ practitioners in gis training a throwing technique during live grappling with an American flag in the background",
      overlay: "medium"
    },
    audience: "Students & Supporters",
    curriculum: {
      title: "Built to support future drops and product storytelling.",
      copy:
        "This page is structured to collect early interest now and can later expand with product details, release windows, sizing, and drop-day updates."
    },
    benefits: {
      title: "Why join the list now",
      items: [
        "Get early notice before the public drop opens.",
        "Stay connected to future Burning Tree apparel and gear announcements.",
        "Give the academy a stronger sense of demand before launch."
      ]
    },
    galleryImages: [
      { src: "/images/chimpman-gi-gallery-1.jpg", alt: "Close-up of a white BJJ gi sleeve featuring the embroidered ChimpanGi chimp mascot patch" },
      { src: "/images/chimpman-gi-gallery-2.jpg", alt: "BJJ practitioners in gis training a throwing technique during live grappling with an American flag in the background" },
      { src: "/images/chimpman-gi-gallery-3.jpg", alt: "Two adult BJJ students in gis grappling in a top mount position on the mat, black and white photo" }
    ],
    showTestimonials: false,
    leadForm: {
      title: "Home of the Best Gi You'll Have Ever Owned",
      intro: "Join our waitlist to be the first to know when our custom gi drops and secure your spot in the first release.",
      submitLabel: "Submit",
      hideProgramSelect: true
    }
  },

  // ── Health & Wellness ────────────────────────────────────────────────────────
  {
    slug: "health-and-wellness",
    seo: {
      title: "Health and Wellness in Owings Mills | Burning Tree MMA",
      description:
        "Explore health and wellness services from Burning Tree MMA in Owings Mills with a focus on recovery, coaching, and sustainable progress.",
      keywords: [
        "health and wellness Owings Mills",
        "wellness coaching",
        "martial arts recovery",
        "fitness support Maryland"
      ]
    },
    hero: {
      title: "Health and Wellness",
      image: "/images/health-and-wellness-hero.jpg",
      imageAlt: "Wellness room interior with a massage table, massage chair, whiteboard, and artwork on the walls",
      overlay: "medium"
    },
    audience: "Adults & Families",
    curriculum: {
      title: "A wellness track built around sustainable support.",
      copy:
        "Every service inside Burning Tree Health and Wellness is intentionally delivered to support total-body restoration, including:\n\n- Massage therapy that relieves chronic tension and restores mobility.\n- Acupuncture that reduces inflammation, regulates the nervous system, and improves sleep.\n- Reiki that quiets stress responses and recalibrates internal balance.\n- Access to over 450 non-toxic wellness products that support clean, aligned living.\n\nEach session, recommendation, and product is selected with purpose, whether you are recovering from strain, managing stress, or seeking a full reset."
    },
    benefits: {
      title: "Our Wellness Services",
      items: [
        "Massage therapy to support recovery, reduce tension, and improve mobility.",
        "Acupuncture for targeted relief, balance, and holistic healing support.",
        "Reiki energy work to restore alignment, calm the mind, and reduce stress.",
        "450 non-toxic wellness products that support clean, aligned living."
      ]
    },
    galleryImages: [
      { src: "/images/health-and-wellness-gallery-1.jpg", alt: "Wellness room interior with a massage table, massage chair, whiteboard, and artwork on the walls" },
      { src: "/images/health-and-wellness-gallery-2.jpg", alt: "Display shelves of wellness and supplement products alongside Burning Tree MMA merchandise in the lobby" },
      { src: "/images/health-and-wellness-gallery-3.jpg", alt: "Wellness Room door with bamboo leaf stencil artwork and an Available digital sign" }
    ],
    showTestimonials: false,
    showSchedule: false,
    showLeadForm: false,
    accentTheme: "wellness",
    leadForm: {
      title: "Ask About Wellness Services",
      intro: "Tell us what kind of support you are looking for and we will share the best next step.",
      defaultProgram: "Health and Wellness",
      hideProgramSelect: true
    }
  }
];

// ─── Wellness booking ──────────────────────────────────────────────────────────

export const wellnessBooking = {
  // Price per 45-minute session. Update this to change the displayed price
  price: 120,
  services: ["Reiki", "Massage", "Acupuncture"] as const,
  sessionDurationMinutes: 45,
  // Add additional recipient emails to this array as needed
  notificationEmails: ["kaleielendale@gmail.com"]
};

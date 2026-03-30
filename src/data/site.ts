export type ThemeName = "flame" | "wellness";

export type NavItem = {
  label: string;
  href: string;
};

export type HeroContent = {
  title: string;
  image: string;
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
};

export type SupportingPage = {
  slug: string;
  seo: SEOData;
  hero: HeroContent;
};

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
  tagline: "Keepers of the Flame",
  hours: [
    "Monday - Friday: 5:00 PM - 9:00 PM",
    "Saturday: 9:30 AM - 11:30 AM",
    "Sunday: Closed"
  ],
  social: {
    instagram: "https://www.instagram.com/burningtreemma/",
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

export const categoryKeywords = [
  "martial arts",
  "martial arts school",
  "martial arts academy",
  "self-defense",
  "martial arts classes",
  "martial arts training"
];

export const programInterestOptions = [
  "Adults Classes",
  "Kids Classes"
];

export const primaryPrograms: NavItem[] = [
  { label: "Kids Martial Arts", href: "/kids-martial-arts" },
  { label: "Adult Martial Arts", href: "/adult-martial-arts" },
  { label: "Kids Jiu-Jitsu", href: "/kids-jiu-jitsu" },
  { label: "Brazilian Jiu-Jitsu", href: "/brazilian-jiu-jitsu" },
  { label: "Muay Thai", href: "/muay-thai" }
];

export const secondaryNav: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "ChimpanGi", href: "/chimpman-gi" },
  { label: "Health & Wellness", href: "/health-and-wellness" }
];

export const homepagePrograms: ProgramCard[] = [
  {
    eyebrow: "Jr. Kenpo",
    title: "Kids Karate Martial Arts",
    href: "/kids-martial-arts",
    summary:
      "American Kenpo for Jrs. ages 4 and up"
  },
  {
    eyebrow: "American Kenpo",
    title: "Adult Kenpo Martial Arts",
    href: "/adult-martial-arts",
    summary:
      "Sharpening Skills, Strength, and Spirit ."
  },
  {
    eyebrow: "Kids Jiu-Jitsu",
    title: "Kids Jiu-Jitsu",
    href: "/kids-jiu-jitsu",
    summary:
      "Confidence and Problem-Solving from the Ground Up"
  },
  {
    eyebrow: "Adult Jiu-Jitsu",
    title: "Adult Brazilian Jiu-Jitsu",
    href: "/brazilian-jiu-jitsu",
    summary:
      "Challenge the Body, Strengthen the Mind"
  },
  {
    eyebrow: "Art of Eight Limbs",
    title: "Muay Thai",
    href: "/muay-thai",
    summary:
      "The Art of Eight Limbs, The Path to Power and Precision."
  },
  {
    eyebrow: "Events",
    title: "Birthday Parties",
    href: "/birthday-parties",
    summary:
      "Active martial arts birthday parties in Owings Mills that create memorable, high-energy events for families."
  }
];

export const homePage: {
  seo: SEOData;
  hero: HeroContent;
  leadForm: LeadFormConfig;
} = {
  seo: {
    title: "Martial Arts Classes in Owings Mills | Burning Tree MMA",
    description:
      "Burning Tree MMA offers kids martial arts, adult martial arts, kids and adult Brazilian jiu-jitsu, Muay Thai, birthday parties, and wellness services in Owings Mills.",
    keywords: [
      ...categoryKeywords,
      "MMA Owings Mills",
      "kids martial arts Owings Mills",
      "adult martial arts Owings Mills",
      "Brazilian jiu-jitsu Owings Mills",
      "Muay Thai Owings Mills",
      "karate classes near me",
      "world-class instructors",
      "safe and structured environment"
    ]
  },
  hero: {
    title: "Keepers of the flame",
    image: "/images/home-hero.png",
    overlay: "strong"
  },
  leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "General Information"
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
    overlay: "medium"
  },
  leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "General Information"
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
        "Yes. We offer kids martial arts, adult martial arts, kids jiu-jitsu, Brazilian jiu-jitsu, Muay Thai, birthday parties, and wellness-oriented services."
    },
    {
      question: "Where is Burning Tree MMA located?",
      answer:
        "We are located at 10210 S Dolfield Rd in Owings Mills, Maryland, serving local families and adults looking for martial arts classes near them."
    }
  ],
  leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "General Information"
  }
};

export const programPages: ProgramPage[] = [
  {
    slug: "kids-martial-arts",
    seo: {
      title: "Kids Martial Arts in Owings Mills | Burning Tree MMA",
      description:
        "Jr. Kenpo kids martial arts classes in Owings Mills that build confidence, discipline, focus, and self-defense in a safe environment.",
      keywords: [
        ...categoryKeywords,
        "kids karate Owings Mills",
        "Jr. Kenpo",
        "kids karate classes near me",
        "kids self-defense",
        "confidence for children"
      ]
    },
    hero: {
      title: "Kids Karate Martial Arts",
      image: "/images/kids-martial-arts-hero.jpg",
      overlay: "strong"
    },
    audience: "Kids",
    curriculum: {
      title: "A structured Jr. Kenpo path with real progression.",
      copy:
        "Students learn age-appropriate American Kenpo fundamentals, striking drills, movement patterns, belt progression, and respectful classroom habits that transfer into everyday life."
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
      { src: "/images/kids-martial-arts-gallery-1.png", alt: "Kids martial arts gallery  1" },
      { src: "/images/kids-martial-arts-gallery-2.jpg", alt: "Kids martial arts gallery  2" },
      { src: "/images/kids-martial-arts-gallery-3.jpg", alt: "Kids martial arts gallery  3" }
    ],
    leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "Kids Classes"
  }
  },
  {
    slug: "adult-martial-arts",
    seo: {
      title: "Adult Martial Arts in Owings Mills | Burning Tree MMA",
      description:
        "American Kenpo martial arts classes for adults in Owings Mills focused on self-defense, technique, fitness, and personal growth.",
      keywords: [
        ...categoryKeywords,
        "adult karate Owings Mills",
        "American Kenpo",
        "karate for adults",
        "adult self-defense",
        "full-body workout"
      ]
    },
    hero: {
      title:  "Adult Kenpo Martial Arts",
      image: "/images/adult-martial-arts-hero.jpg",
      overlay: "strong"
    },
    audience: "Adults",
    curriculum: {
      title: "Technical training with clear progression.",
      copy:
        "Students work through American Kenpo concepts, combinations, forms, belt ranks, and partner drills that improve timing, awareness, confidence, and consistency."
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
      { src: "/images/adult-martial-arts-gallery-1.png", alt: "Adult martial arts gallery  1" },
      { src: "/images/adult-martial-arts-gallery-2.jpg", alt: "Adult martial arts gallery  2" },
      { src: "/images/adult-martial-arts-gallery-3.jpg", alt: "Adult martial arts gallery  3" }
    ],
    leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "Adults Classes"
  }
  },
  {
    slug: "kids-jiu-jitsu",
    seo: {
      title: "Kids Jiu-Jitsu in Owings Mills | Burning Tree MMA",
      description:
        "Kids Brazilian jiu-jitsu classes in Owings Mills that build resilience, body awareness, teamwork, and calm problem-solving.",
      keywords: [
        ...categoryKeywords,
        "kids jiu-jitsu Owings Mills",
        "kids BJJ",
        "children's grappling",
        "problem-solving martial arts kids"
      ]
    },
    hero: {
      title: "Kids Jiu-Jitsu",
      image: "/images/kids-jiu-jitsu-hero.jpg",
      overlay: "strong"
    },
    audience: "Kids",
    curriculum: {
      title: "Technique-first grappling for growing students.",
      copy:
        "Students learn takedowns, movement patterns, positional control, and beginner submissions through structured Brazilian jiu-jitsu instruction and guided repetition."
    },
    benefits: {
      title: "What makes kids jiu-jitsu valuable",
      items: [
        "Problem-solving and resilience built through technical grappling practice.",
        "Body awareness, teamwork, and respect in a controlled martial arts training environment.",
        "Confidence that comes from learning calm responses under pressure."
      ]
    },
    galleryImages: [
      { src: "/images/kids-jiu-jitsu-gallery-1.jpg", alt: "Kids jiu-jitsu gallery  1" },
      { src: "/images/kids-jiu-jitsu-gallery-2.png", alt: "Kids jiu-jitsu gallery  2" },
      { src: "/images/kids-jiu-jitsu-gallery-3.jpg", alt: "Kids jiu-jitsu gallery  3" }
    ],
    leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "Kids Classes"
  }
  },
  {
    slug: "brazilian-jiu-jitsu",
    seo: {
      title: "Brazilian Jiu-Jitsu in Owings Mills | Burning Tree MMA",
      description:
        "Adult Brazilian jiu-jitsu classes in Owings Mills with live practice, technique, escapes, submissions, and beginner-friendly coaching.",
      keywords: [
        ...categoryKeywords,
        "adult Brazilian jiu-jitsu Owings Mills",
        "adult BJJ",
        "BJJ classes near me",
        "ground fighting",
        "escapes and submissions"
      ]
    },
    hero: {
      title: "Brazilian Jiu-Jitsu",
      image: "/images/brazilian-jiu-jitsu-hero.jpg",
      overlay: "strong"
    },
    audience: "Adults",
    curriculum: {
      title: "Foundations, pressure, and steady progression.",
      copy:
        "Training covers foundational movement, guard work, passes, escapes, submissions, and controlled sparring so students can build skill and confidence over time."
    },
    benefits: {
      title: "Why adults choose BJJ",
      items: [
        "A practical martial arts system that rewards patience, technique, and adaptability.",
        "A demanding workout that improves body awareness, stress relief, and focus.",
        "Progressive coaching that supports complete beginners as well as experienced grapplers."
      ]
    },
    galleryImages: [
      { src: "/images/brazilian-jiu-jitsu-gallery-1.jpg", alt: "Brazilian jiu-jitsu gallery  1" },
      { src: "/images/brazilian-jiu-jitsu-gallery-2.jpg", alt: "Brazilian jiu-jitsu gallery  2" },
      { src: "/images/brazilian-jiu-jitsu-gallery-3.png", alt: "Brazilian jiu-jitsu gallery  3" }
    ],
    leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "Adults Classes"
  }
  },
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
      overlay: "strong"
    },
    audience: "Teens & Adults",
    curriculum: {
      title: "The art of eight limbs with steady skill-building.",
      copy:
        "Students train punches, kicks, elbows, knees, footwork, combinations, pad rounds, and clinch technique with strong coaching on form, balance, and control."
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
      { src: "/images/muay-thai-gallery-1.jpg", alt: "Muay Thai gallery  1" },
      { src: "/images/muay-thai-gallery-2.png", alt: "Muay Thai gallery  2" },
      { src: "/images/muay-thai-gallery-3.png", alt: "Muay Thai gallery  3" }
    ],
    leadForm: {
    title: "View Our Web Special & Access Our Schedule",
    intro:
      "Take the first step today, we will reach out to follow up with you",
    submitLabel: "Submit",
    defaultProgram: "Adults Classes"
  }
  },
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
      overlay: "medium"
    },
    audience: "Families",
    curriculum: {
      title: "An event built around fun and movement.",
      copy:
        "Each party is designed to keep kids engaged with age-appropriate martial arts activities, team games, and coach-led moments that feel exciting and organized."
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
      { src: "/images/birthday-parties-gallery-1.jpg", alt: "Birthday parties gallery  1" },
      { src: "/images/birthday-parties-gallery-2.jpg", alt: "Birthday parties gallery  2" },
      { src: "/images/birthday-parties-gallery-3.jpg", alt: "Birthday parties gallery  3" }
    ],
    showTestimonials: false,
    leadForm: {
      title: "Ask About Birthday Parties",
      intro:
        "Tell us your preferred date, age group, and party goals and we will follow up with details.",
      defaultProgram: "Birthday Parties",
      hideProgramSelect: true
    }
  },
  {
    slug: "chimpman-gi",
    seo: {
      title: "ChimpanGi Drop Sign Up | Burning Tree MMA",
      description:
        "Join the Burning Tree MMA ChimpanGi drop list to hear when the next custom gi release becomes available.",
      keywords: [
        "ChimpanGi",
        "custom gi drop",
        "Burning Tree gi",
        "martial arts apparel"
      ]
    },
    hero: {
      title: "Home of the best Gi",
      image: "/images/chimpman-gi-hero.jpg",
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
      { src: "/images/chimpman-gi-gallery-1.png", alt: "ChimpanGi gallery  1" },
      { src: "/images/chimpman-gi-gallery-2.jpg", alt: "ChimpanGi gallery  2" },
      { src: "/images/chimpman-gi-gallery-3.jpg", alt: "ChimpanGi gallery  3" }
    ],
    showTestimonials: false,
    leadForm: {
    title: "Home of the Best Gi You’ll Have Ever Owned",
    intro:
      "Join our waitlist to be the first to know when our custom gi drops and secure your spot in the first release.",
    submitLabel: "Submit",
    hideProgramSelect: true
  }
  },
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
      { src: "/images/health-and-wellness-gallery-1.jpg", alt: "Health and wellness gallery  1"},
      { src: "/images/health-and-wellness-gallery-2.jpg", alt: "Health and wellness gallery  2"},
      { src: "/images/health-and-wellness-gallery-3.jpg", alt: "Health and wellness gallery  3" }
    ],
    showTestimonials: false,
    leadForm: {
      title: "Ask About Wellness Services",
      intro:
        "Tell us what kind of support you are looking for and we will share the best next step.",
      defaultProgram: "Health and Wellness",
      hideProgramSelect: true
    },
    accentTheme: "wellness"
  }
];

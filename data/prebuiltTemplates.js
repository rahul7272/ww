/**
 * PRE-BUILT READYMADE WHATSAPP TEMPLATES CATALOG
 * 182 Meta-Compliant Templates across 11 Industries
 * Multi-lingual: English (en), Hindi (hi), Gujarati (gu)
 */

export const PREBUILT_TEMPLATES = [
  {
    "slug": "ecommerce-order-confirmed",
    "title": "Order confirmed",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Confirmation message sent immediately after an online checkout.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for your order ({{2}}). We are packing it now and will message you as soon as it ships.",
        "sampleValues": {
          "1": "Ravi",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Track Order",
            "value": "https://example.com/track/{{2}}"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Need Help",
            "value": "HELP_ORDER"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "नमस्ते {{1}}, आपके ऑर्डर ({{2}}) के लिए धन्यवाद। हम इसे पैक कर रहे हैं और जैसे ही यह रवाना होगा, आपको सूचित करेंगे।",
        "sampleValues": {
          "1": "रवि",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "ऑर्डर ट्रैक करें",
            "value": "https://example.com/track/{{2}}"
          },
          {
            "type": "QUICK_REPLY",
            "text": "सहायता चाहिए",
            "value": "HELP_ORDER"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "નમસ્તે {{1}}, તમારા ઓર્ડર ({{2}}) બદલ આભાર. અમે તેને પેક કરી રહ્યા છીએ અને તે મોકલાતા જ તમને મેસેજ કરીશું.",
        "sampleValues": {
          "1": "રવિ",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "ઓર્ડર ટ્રેક કરો",
            "value": "https://example.com/track/{{2}}"
          },
          {
            "type": "QUICK_REPLY",
            "text": "મદદ જોઈએ છે",
            "value": "HELP_ORDER"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-order-shipped",
    "title": "Order shipped",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Dispatch alert with courier name and expected delivery date.",
    "isPopular": true,
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Good news {{1}}! Your order ({{2}}) has been shipped with {{3}}. Expected delivery: {{4}}.",
        "sampleValues": {
          "1": "Priya",
          "2": "#ORD-8821",
          "3": "BlueDart",
          "4": "Tomorrow, 5:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Live Tracking",
            "value": "https://example.com/track"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call Courier",
            "phoneNumber": "+919876543210"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "खुशखबरी {{1}}! आपका ऑर्डर ({{2}}) {{3}} द्वारा भेज दिया गया है। अनुमानित डिलीवरी: {{4}}।",
        "sampleValues": {
          "1": "प्रिया",
          "2": "#ORD-8821",
          "3": "BlueDart",
          "4": "कल शाम 5:00 बजे"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "लाइव ट्रैकिंग",
            "value": "https://example.com/track"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "ખુશખબર {{1}}! તમારો ઓર્ડર ({{2}}) {{3}} દ્વારા મોકલી દેવાયો છે. અપેક્ષિત ડિલિવરી: {{4}}.",
        "sampleValues": {
          "1": "પ્રિયા",
          "2": "#ORD-8821",
          "3": "BlueDart",
          "4": "આવતીકાલે સાંજે 5:00 વાગ્યે"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "લાઈવ ટ્રેકિંગ",
            "value": "https://example.com/track"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-confirm-cod-order",
    "title": "Confirm cash-on-delivery order",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Verify Cash on Delivery orders to eliminate RTO and bogus orders.",
    "isPopular": true,
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, please confirm your cash-on-delivery order ({{2}}) of {{3}} so that we can ship it today.",
        "sampleValues": {
          "1": "Ankit",
          "2": "#COD-441",
          "3": "₹1,499"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "✓ Confirm Order",
            "value": "CONFIRM_COD"
          },
          {
            "type": "QUICK_REPLY",
            "text": "✕ Cancel Order",
            "value": "CANCEL_COD"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "नमस्ते {{1}}, कृपया अपने कैश-ऑन-डिलीवरी ऑर्डर ({{2}}) राशि {{3}} की पुष्टि करें ताकि हम इसे आज ही भेज सकें।",
        "sampleValues": {
          "1": "अंकित",
          "2": "#COD-441",
          "3": "₹1,499"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "✓ ऑर्डर कन्फर्म करें",
            "value": "CONFIRM_COD"
          },
          {
            "type": "QUICK_REPLY",
            "text": "✕ कैंसिल करें",
            "value": "CANCEL_COD"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "નમસ્તે {{1}}, કૃપા કરીને તમારા કેશ-ઓન-ડિલિવરી ઓર્ડર ({{2}}) રકમ {{3}} ની પુષ્ટિ કરો જેથી અમે તેને આજે મોકલી શકીએ.",
        "sampleValues": {
          "1": "અંકિત",
          "2": "#COD-441",
          "3": "₹1,499"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "✓ ઓર્ડર કન્ફર્મ કરો",
            "value": "CONFIRM_COD"
          },
          {
            "type": "QUICK_REPLY",
            "text": "✕ રદ કરો",
            "value": "CANCEL_COD"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-delivered-how-was-it",
    "title": "Delivered — how was it?",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Feedback on a delivered order, three tap-to-answer buttons.",
    "isPopular": true,
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your order ({{2}}) has been delivered. How was your experience with this order?",
        "sampleValues": {
          "1": "Ravi",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Loved it",
            "value": "RATING_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "It was okay",
            "value": "RATING_3"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Not happy",
            "value": "RATING_1"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "नमस्ते {{1}}, आपका ऑर्डर ({{2}}) डिलीवर हो गया है। इस ऑर्डर के साथ आपका अनुभव कैसा रहा?",
        "sampleValues": {
          "1": "रवि",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "बहुत पसंद आया",
            "value": "RATING_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "ठीक ठाक था",
            "value": "RATING_3"
          },
          {
            "type": "QUICK_REPLY",
            "text": "पसंद नहीं आया",
            "value": "RATING_1"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "નમસ્તે {{1}}, તમારો ઓર્ડર ({{2}}) પહોંચાડવામાં આવ્યો છે. આ ઓર્ડર સાથેનો તમારો અનુભવ કેવો રહ્યો?",
        "sampleValues": {
          "1": "રવિ",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "ખૂબ ગમ્યું",
            "value": "RATING_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "સાધારણ હતું",
            "value": "RATING_3"
          },
          {
            "type": "QUICK_REPLY",
            "text": "પસંદ ન આવ્યું",
            "value": "RATING_1"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-items-left-in-cart",
    "title": "Items left in cart",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Cart abandonment recovery with free delivery incentive.",
    "isPopular": true,
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&q=80"
        },
        "body": "Hi {{1}}, you left something in your cart 🛒. Complete your order today and we will deliver it free of charge.",
        "sampleValues": {
          "1": "Sneha"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Complete Order",
            "value": "https://example.com/cart"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Clear Cart",
            "value": "CLEAR_CART"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&q=80"
        },
        "body": "नमस्ते {{1}}, आपने अपने कार्ट में कुछ सामान छोड़ दिया है 🛒। आज ही अपना ऑर्डर पूरा करें और मुफ्त डिलीवरी का लाभ उठाएं।",
        "sampleValues": {
          "1": "स्नेहा"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "ऑर्डर पूरा करें",
            "value": "https://example.com/cart"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&q=80"
        },
        "body": "નમસ્તે {{1}}, તમે તમારા કાર્ટમાં કેટલીક વસ્તુઓ છોડી દીધી છે 🛒. આજે જ તમારો ઓર્ડર પૂર્ણ કરો અને મફત ડિલિવરી મેળવો.",
        "sampleValues": {
          "1": "સ્નેહા"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "ઓર્ડર પૂર્ણ કરો",
            "value": "https://example.com/cart"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-back-in-stock",
    "title": "Back in stock",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Instant notification for wishlist items returning to stock.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80"
        },
        "body": "Hi {{1}}, good news — {{2}} is back in stock. Popular sizes sell out quickly, so order soon.",
        "sampleValues": {
          "1": "Aman",
          "2": "Noise Ultra Smartwatch"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Buy Now",
            "value": "https://example.com/product/123"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-festive-sale-carousel",
    "title": "Festive sale (carousel)",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "CAROUSEL",
    "description": "Multi-card carousel showcasing product collections and discounts.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Our festive sale is live 🎉 Swipe to see this week's best picks for you.",
        "sampleValues": {},
        "buttons": [
          {
            "type": "URL",
            "text": "View All Deals",
            "value": "https://example.com/deals"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-order-confirmed-text",
    "title": "Order confirmed",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Lightweight, minimal text-only order confirmation.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thanks for your order ({{2}}). We will let you know as soon as it ships.",
        "sampleValues": {
          "1": "Karan",
          "2": "#ORD-9901"
        }
      }
    ]
  },
  {
    "slug": "ecommerce-out-for-delivery",
    "title": "Out for delivery",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Real-time alert when courier is arriving at recipient address.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Good news {{1}} — order ({{2}}) is out for delivery today.",
        "sampleValues": {
          "1": "Deepak",
          "2": "#A1001"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Contact Driver",
            "phoneNumber": "+919988776655"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-abandoned-cart",
    "title": "Abandoned cart",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Follow-up text with dynamic cart contents.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, you left {{2}} in your cart. It is still available if you would like to finish checking out.",
        "sampleValues": {
          "1": "Meera",
          "2": "Cotton Formal Shirt"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Checkout Now",
            "value": "https://example.com/cart"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-festive-offer",
    "title": "Festive offer",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Promo coupon announcement with copy code button.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, enjoy {{2}} off everything this week. Use the code below at checkout.",
        "sampleValues": {
          "1": "Rahul",
          "2": "25%"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "FESTIVE25",
            "value": "FESTIVE25"
          },
          {
            "type": "URL",
            "text": "Shop Now",
            "value": "https://example.com/sale"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-order-refund",
    "title": "Order cancelled & refund",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Cancellation confirmation and refund timeline notice.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, order ({{2}}) has been cancelled. Your refund of {{3}} has been initiated to your original payment method within {{4}} working days.",
        "sampleValues": {
          "1": "Neha",
          "2": "#ORD-771",
          "3": "₹2,350",
          "4": "3-5"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Refund Status",
            "value": "https://example.com/refunds"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-reschedule-delivery",
    "title": "Delivery attempted - reschedule",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Follow-up when recipient was unavailable during delivery attempt.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, we attempted delivery of ({{2}}) today but could not reach you. Please pick a preferred slot for re-delivery.",
        "sampleValues": {
          "1": "Sanjay",
          "2": "#PKG-902"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Deliver Tomorrow",
            "value": "SLOT_TOMORROW"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Change Address",
            "value": "CHANGE_ADDRESS"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-price-drop",
    "title": "Price drop alert",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Alert when a saved item goes on discount.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80"
        },
        "body": "Price Drop Alert! 🎉 {{1}}, {{2}} is now available for just {{3}} (previously {{4}}). Limited stock available.",
        "sampleValues": {
          "1": "Varun",
          "2": "Sony WH-1000XM5",
          "3": "₹24,990",
          "4": "₹29,990"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Grab Deal",
            "value": "https://example.com/deal/headphones"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-vip-loyalty",
    "title": "VIP loyalty reward",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Reward announcement for top repeat customers.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Congratulations {{1}}! You have unlocked VIP Gold tier 🌟. We have credited {{2}} loyalty points to your wallet.",
        "sampleValues": {
          "1": "Divya",
          "2": "500"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Wallet",
            "value": "https://example.com/wallet"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-flash-sale",
    "title": "Flash sale 24h",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Time-sensitive flash sale banner with countdown trigger.",
    "order": 16,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80"
        },
        "body": "⚡ 24-HOUR FLASH SALE ⚡ Hi {{1}}, enjoy up to {{2}} off on all top electronics. Hurry, sale ends at midnight!",
        "sampleValues": {
          "1": "Customer",
          "2": "60%"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Shop Flash Sale",
            "value": "https://example.com/flash"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-review-request",
    "title": "Product review request",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Post-purchase review and feedback collection.",
    "order": 17,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, how are you enjoying your new {{2}}? Your honest review helps fellow shoppers make the right choice.",
        "sampleValues": {
          "1": "Manish",
          "2": "Running Shoes"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Write Review (Win ₹100)",
            "value": "https://example.com/review"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-return-pickup",
    "title": "Return pickup scheduled",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Logistics pickup coordination for returned goods.",
    "order": 18,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, return pickup for order ({{2}}) has been scheduled for {{3}}. Please keep the product packed with original tags.",
        "sampleValues": {
          "1": "Kavita",
          "2": "#ORD-449",
          "3": "Tomorrow between 10 AM - 2 PM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Reschedule Pickup",
            "value": "RESCHEDULE_RETURN"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-invoice-download",
    "title": "Invoice download",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Automated GST invoice PDF delivery via WhatsApp.",
    "order": 19,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/sample-invoice.pdf"
        },
        "body": "Hi {{1}}, please find attached your official tax invoice for order ({{2}}). Thank you for shopping with us!",
        "sampleValues": {
          "1": "Gaurav",
          "2": "#INV-2026-99"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "My Account",
            "value": "https://example.com/account"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-gift-card",
    "title": "Gift card issued",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Digital gift card code delivery.",
    "order": 20,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "You received a Gift Card! 🎁 Hi {{1}}, {{2}} sent you a gift card worth {{3}}. Use code {{4}} at checkout.",
        "sampleValues": {
          "1": "Tina",
          "2": "Aarav",
          "3": "₹2,000",
          "4": "GIFT-2000-XYZ"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "Copy Code",
            "value": "GIFT-2000-XYZ"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-refer-friend",
    "title": "Refer a friend bonus",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Viral referral promotion.",
    "order": 21,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Share the love, earn rewards! 💸 Hi {{1}}, invite your friends to shop and both of you will get {{2}} off your next order.",
        "sampleValues": {
          "1": "Simran",
          "2": "₹250"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Get Referral Link",
            "value": "https://example.com/refer"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-preorder-confirmed",
    "title": "Pre-order confirmed",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Booking confirmation for upcoming product launches.",
    "order": 22,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Pre-order Confirmed! 🚀 Hi {{1}}, your booking for {{2}} is locked in. Expected release & dispatch date: {{3}}.",
        "sampleValues": {
          "1": "Aditya",
          "2": "PlayStation VR2",
          "3": "15 Dec 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pre-order Details",
            "value": "https://example.com/preorder"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-exchange-approved",
    "title": "Exchange request approved",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Size or variant exchange approval notice.",
    "order": 23,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your size exchange request for {{2}} to size {{3}} has been approved. The replacement will be dispatched shortly.",
        "sampleValues": {
          "1": "Pooja",
          "2": "Denim Jacket",
          "3": "L"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Track Exchange",
            "value": "https://example.com/exchange"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-subscription-renewal",
    "title": "Subscription renewal order",
    "industry": "Ecommerce",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Recurring replenishment order alert for FMCG / coffee / supplements.",
    "order": 24,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your monthly subscription for {{2}} is scheduled to renew on {{3}}. Need to skip or swap items?",
        "sampleValues": {
          "1": "Chetan",
          "2": "Organic Coffee Beans",
          "3": "1st of next month"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Skip this Month",
            "value": "SKIP_SUB"
          },
          {
            "type": "URL",
            "text": "Manage Plan",
            "value": "https://example.com/sub"
          }
        ]
      }
    ]
  },
  {
    "slug": "ecommerce-restock-reminder",
    "title": "Restock reminder",
    "industry": "Ecommerce",
    "category": "MARKETING",
    "format": "TEXT",
    "description": "Predictive replenishment reminder based on past usage.",
    "order": 25,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, running low on {{2}}? Re-order today with 1-click and get delivery tomorrow.",
        "sampleValues": {
          "1": "Sunil",
          "2": "Daily Protein Powder"
        }
      }
    ]
  },
  {
    "slug": "restaurant-table-booked",
    "title": "Table booked",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Reservation confirmation with guest count, date and time.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your table for {{2}} is booked on {{3}} at {{4}}. We will hold it for 15 minutes.",
        "sampleValues": {
          "1": "Vikram",
          "2": "4 guests",
          "3": "Tonight",
          "4": "8:30 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Get Directions",
            "value": "https://maps.google.com"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call Restaurant",
            "phoneNumber": "+919876500000"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "नमस्ते {{1}}, {{2}} लोगों के लिए आपकी टेबल {{3}} को {{4}} बजे बुक हो गई है। हम इसे 15 मिनट तक आरक्षित रखेंगे।",
        "sampleValues": {
          "1": "विक्रम",
          "2": "4",
          "3": "आज रात",
          "4": "8:30"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "दिशा-निर्देश देखें",
            "value": "https://maps.google.com"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "નમસ્તે {{1}}, {{2}} મહેમાનો માટે તમારું ટેબલ {{3}} ના રોજ {{4}} વાગ્યે બુક થઈ ગયું છે. અમે તેને 15 મિનિટ સુધી રાખીશું.",
        "sampleValues": {
          "1": "વિક્રમ",
          "2": "4",
          "3": "આજે રાત્રે",
          "4": "8:30"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "દિશાનિર્દેશો મેળવો",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-order-pickup",
    "title": "Order ready for pickup",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Counter pickup alert for takeaway customers.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your order ({{2}}) is ready for pickup at the counter. Please show this message when you arrive.",
        "sampleValues": {
          "1": "Sameer",
          "2": "#T-504"
        }
      }
    ]
  },
  {
    "slug": "restaurant-food-on-the-way",
    "title": "Food on the way",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Live delivery dispatch alert with ETA.",
    "isPopular": true,
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your food is on the way 🛵 {{2}} will reach you in about {{3}} minutes.",
        "sampleValues": {
          "1": "Rohan",
          "2": "Rider Ramesh",
          "3": "20"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Delivery Partner",
            "phoneNumber": "+919812345678"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-weekend-offer",
    "title": "Weekend offer",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Promotional dine-in and online order offer.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80"
        },
        "body": "Hi {{1}}, this weekend only: {{2}} on all main course dishes 🍲. Dine in or order online.",
        "sampleValues": {
          "1": "Foodie",
          "2": "Flat 20% Off"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Order Online",
            "value": "https://example.com/menu"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Reserve Table",
            "value": "RESERVE_TABLE"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-chefs-specials-carousel",
    "title": "Chef's specials (carousel)",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "CAROUSEL",
    "description": "Carousel menu highlighting seasonal gourmet dishes.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Our chef's specials are back this week 👨‍🍳. Swipe to see today's favourites.",
        "sampleValues": {},
        "buttons": [
          {
            "type": "URL",
            "text": "Explore Menu",
            "value": "https://example.com/menu"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-table-reminder",
    "title": "Table reservation reminder",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Automated 2-hour advance reminder for booked tables.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Reminder: Hi {{1}}, your table reservation for {{2}} guests is in 2 hours (at {{3}}). Looking forward to hosting you!",
        "sampleValues": {
          "1": "Siddharth",
          "2": "6",
          "3": "8:00 PM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "We are on our way",
            "value": "ON_THE_WAY"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Cancel Booking",
            "value": "CANCEL_BOOKING"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-dining-feedback",
    "title": "Dining feedback",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Post-meal review and satisfaction rating.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Thank you for dining with us today, {{1}}! 🍽️ How did you enjoy your food and service?",
        "sampleValues": {
          "1": "Ananya"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "⭐ Outstanding",
            "value": "RATE_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "👍 Good",
            "value": "RATE_4"
          },
          {
            "type": "QUICK_REPLY",
            "text": "👎 Needs Improvement",
            "value": "RATE_2"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-happy-hours",
    "title": "Happy hours alert",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Beverage and appetizer discount announcement.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80"
        },
        "body": "Happy Hours are Live! 🍹 Hi {{1}}, buy 1 get 1 free on all signature drinks every weekday between {{2}}.",
        "sampleValues": {
          "1": "Friend",
          "2": "4:00 PM to 7:30 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Cocktail Menu",
            "value": "https://example.com/drinks"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-weekend-buffet",
    "title": "Buffet special weekend",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Lavish weekend brunch and dinner buffet invitation.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80"
        },
        "body": "Grand Sunday Brunch 🥐 Hi {{1}}, over 60+ delicacies with live counters for just {{2}} per person.",
        "sampleValues": {
          "1": "Gourmet",
          "2": "₹899"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Book Brunch Table",
            "value": "BOOK_BRUNCH"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-birthday-discount",
    "title": "Birthday dining discount",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Personalized birthday treat for customer retention.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Happy Birthday Month, {{1}}! 🎂 Celebrate with us and enjoy a complimentary chef cake and {{2}} off your bill.",
        "sampleValues": {
          "1": "Arjun",
          "2": "15%"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Claim Birthday Offer",
            "value": "CLAIM_BDAY"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-takeaway-confirmed",
    "title": "Takeaway order confirmed",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Order summary and kitchen prep time.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, we have received your order ({{2}}). Chef is preparing it fresh! Estimated ready time: {{3}}.",
        "sampleValues": {
          "1": "Manoj",
          "2": "#FOOD-301",
          "3": "15-20 mins"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Live Prep Status",
            "value": "https://example.com/order-status"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-catering-inquiry",
    "title": "Catering inquiry response",
    "industry": "Restaurant",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Bulk party & event catering quotation follow-up.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for inquiring about catering for your event on {{2}}. Our catering specialist has prepared a customized menu proposal for {{3}} guests.",
        "sampleValues": {
          "1": "Mr. Sharma",
          "2": "12th Dec",
          "3": "150"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Speak to Chef",
            "phoneNumber": "+919876543200"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-new-menu-launch",
    "title": "New menu launch",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Seasonal winter/summer menu debut announcement.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80"
        },
        "body": "Exciting news {{1}}! Our new winter menu is here 🍲 Featuring authentic regional curries, woodfired flatbreads, and artisan mocktails.",
        "sampleValues": {
          "1": "Food Lover"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View New Menu",
            "value": "https://example.com/winter-menu"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-free-dessert",
    "title": "Loyalty free dessert",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Sweet incentive for repeat diners.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "We miss you, {{1}}! 🍰 Dine with us this week and enjoy your favourite dessert on the house with any main course order.",
        "sampleValues": {
          "1": "Tarun"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Book My Table",
            "value": "BOOK_TABLE_DESSERT"
          }
        ]
      }
    ]
  },
  {
    "slug": "restaurant-midnight-delivery",
    "title": "Midnight delivery offer",
    "industry": "Restaurant",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Late-night cravings delivery campaign.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Late night cravings? 🌙 We deliver till 3:00 AM! Hi {{1}}, use code {{2}} to get free delivery on all orders above {{3}}.",
        "sampleValues": {
          "1": "Night Owl",
          "2": "MIDNIGHT",
          "3": "₹399"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Order Late Night",
            "value": "https://example.com/latenight"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-payment-received",
    "title": "Payment received",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Instant receipt acknowledgement for customer payments.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, we have received your payment of {{2}} on {{3}}. Reference number: {{4}}. Thank you.",
        "sampleValues": {
          "1": "Vikram",
          "2": "₹5,000",
          "3": "26 Oct",
          "4": "PAY88412"
        }
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "नमस्ते {{1}}, हमें {{3}} को आपका {{2}} का भुगतान प्राप्त हो गया है। संदर्भ संख्या: {{4}}। धन्यवाद।",
        "sampleValues": {
          "1": "विक्रम",
          "2": "₹5,000",
          "3": "26 अक्टूबर",
          "4": "PAY88412"
        }
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "નમસ્તે {{1}}, અમને {{3}} ના રોજ તમારી {{2}} ની ચુકવણી પ્રાપ્ત થઈ છે. સંદર્ભ નંબર: {{4}}. આભાર.",
        "sampleValues": {
          "1": "વિક્રમ",
          "2": "₹5,000",
          "3": "26 ઑક્ટોબર",
          "4": "PAY88412"
        }
      }
    ]
  },
  {
    "slug": "finance-emi-due-reminder",
    "title": "EMI due reminder",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Advance reminder before bank auto-debit to prevent bounce charges.",
    "isPopular": true,
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, your EMI of {{2}} for loan account {{3}} is due on {{4}}. Please keep your account funded.",
        "sampleValues": {
          "1": "Suresh",
          "2": "₹8,450",
          "3": "LA-9921",
          "4": "5th Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Now via UPI",
            "value": "https://example.com/pay"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Already Paid",
            "value": "ALREADY_PAID"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "प्रिय {{1}}, आपके ऋण खाते {{3}} के लिए {{2}} की ईएमआई {{4}} को देय है। कृपया अपने खाते में पर्याप्त शेष राशि बनाए रखें।",
        "sampleValues": {
          "1": "सुरेश",
          "2": "₹8,450",
          "3": "LA-9921",
          "4": "5 नवंबर"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "यूपीआई से भुगतान करें",
            "value": "https://example.com/pay"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "પ્રિય {{1}}, તમારા લોન ખાતા {{3}} માટે {{2}} ની EMI {{4}} ના રોજ ભરવાની બાકી છે. કૃપા કરીને તમારા ખાતામાં પૂરતું બેલેન્સ રાખો.",
        "sampleValues": {
          "1": "સુરેશ",
          "2": "₹8,450",
          "3": "LA-9921",
          "4": "5 નવેમ્બર"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "UPI થી ચુકવણી કરો",
            "value": "https://example.com/pay"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-kyc-pending",
    "title": "KYC pending",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Compliance alert for annual or periodic account re-KYC.",
    "isPopular": true,
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your KYC for account ({{2}}) is incomplete. Please finish it by {{3}} to keep your account active.",
        "sampleValues": {
          "1": "Prakash",
          "2": "XXXX4920",
          "3": "30 Nov 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Complete Digital KYC",
            "value": "https://example.com/kyc"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-statement-pdf",
    "title": "Statement (PDF)",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Monthly account or credit card statement in password-protected PDF.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/statement.pdf"
        },
        "body": "Hi {{1}}, your statement for {{2}} is attached. Please review it and contact us for any questions.",
        "sampleValues": {
          "1": "Rajesh",
          "2": "October 2026"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Request Callback",
            "value": "CALLBACK_REQ"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-policy-renewal",
    "title": "Policy renewal offer",
    "industry": "Finance",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Insurance policy renewal discount with 1-click renewal.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, renew your {{2}} policy before {{3}} and get a loyalty discount on this year’s premium.",
        "sampleValues": {
          "1": "Kiran",
          "2": "Health Insurance",
          "3": "15 Dec 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Renew Instantly",
            "value": "https://example.com/renew"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-loan-preapproved",
    "title": "Loan pre-approved",
    "industry": "Finance",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Pre-approved personal or business credit line.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, congratulations! You are pre-approved for an instant credit line of {{2}} at interest starting from {{3}}.",
        "sampleValues": {
          "1": "Amit",
          "2": "₹5,00,000",
          "3": "10.5% p.a."
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Credit Line",
            "value": "https://example.com/loan"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-credit-card-bill",
    "title": "Credit card bill payment due",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Card statement total due & minimum amount due alert.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, bill for Card ending in {{2}} is {{3}}. Min Due: {{4}}. Payment Due Date: {{5}}.",
        "sampleValues": {
          "1": "Kunal",
          "2": "4021",
          "3": "₹14,200",
          "4": "₹800",
          "5": "12 Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Total Due",
            "value": "https://example.com/pay-card"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-fd-maturity",
    "title": "FD maturity alert",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Fixed deposit maturity date and auto-renewal instruction prompt.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, your Fixed Deposit ({{2}}) of {{3}} is maturing on {{4}}. Maturity value: {{5}}.",
        "sampleValues": {
          "1": "Sunita",
          "2": "FD-88102",
          "3": "₹1,00,000",
          "4": "20 Nov",
          "5": "₹1,07,450"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Renew for 1 Year",
            "value": "RENEW_FD_1Y"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Credit to Savings A/C",
            "value": "PAYOUT_FD"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-sip-processed",
    "title": "SIP investment processed",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Mutual fund monthly SIP debit and NAV allotment confirmation.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your monthly SIP of {{2}} for {{3}} has been successfully executed on {{4}}. Units will reflect within 2 business days.",
        "sampleValues": {
          "1": "Hemant",
          "2": "₹2,500",
          "3": "Nifty 50 Index Fund",
          "4": "10 Nov"
        }
      }
    ]
  },
  {
    "slug": "finance-transaction-otp",
    "title": "Transaction OTP alert",
    "industry": "Finance",
    "category": "AUTHENTICATION",
    "format": "BUTTONS_TEXT",
    "description": "Secure one-time passcode for fund transfers.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "{{1}} is your OTP for transaction of {{2}} at {{3}}. Valid for {{4}} minutes. Do not share with anyone.",
        "sampleValues": {
          "1": "491029",
          "2": "₹1,200",
          "3": "Amazon Pay",
          "4": "5"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "Copy OTP",
            "value": "491029"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-account-credited",
    "title": "Account credited",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Direct salary, dividend, or UPI credit alert.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Account Credited: Your A/C ending {{1}} has been credited with {{2}} via {{3}} on {{4}}. Clear Balance: {{5}}.",
        "sampleValues": {
          "1": "8912",
          "2": "₹65,000",
          "3": "NEFT/Salary",
          "4": "1 Nov",
          "5": "₹84,210"
        }
      }
    ]
  },
  {
    "slug": "finance-claim-status",
    "title": "Insurance claim status update",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Health/motor insurance claim tracking.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, status update on your claim ({{2}}): The cashless claim for {{3}} has been approved by the surveyor.",
        "sampleValues": {
          "1": "Ashish",
          "2": "CLM-2026-09",
          "3": "₹42,000"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Claim Letter",
            "value": "https://example.com/claims"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-tax-invoice-receipt",
    "title": "Tax invoice receipt",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Official GST invoice document for professional services.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/tax-invoice.pdf"
        },
        "body": "Dear {{1}}, thank you for your payment. Please find your official GST Tax Invoice {{2}} attached.",
        "sampleValues": {
          "1": "Vertex Solutions",
          "2": "INV/26/1029"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Customer Portal",
            "value": "https://example.com/portal"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-card-limit-upgrade",
    "title": "Card limit upgrade offer",
    "industry": "Finance",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Free credit limit enhancement invitation.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Exclusive Offer! 🎉 Hi {{1}}, you are eligible for a free credit limit upgrade on Card {{2}} from {{3}} to {{4}} with zero paperwork.",
        "sampleValues": {
          "1": "Rohan",
          "2": "Ending 3910",
          "3": "₹1,50,000",
          "4": "₹3,00,000"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Accept Upgrade",
            "value": "ACCEPT_LIMIT_UPGRADE"
          }
        ]
      }
    ]
  },
  {
    "slug": "finance-suspicious-alert",
    "title": "Suspicious activity alert",
    "industry": "Finance",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Urgent fraud protection check on unrecognized transactions.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "SECURITY ALERT: Was this you? A transaction of {{1}} was attempted on your card {{2}} at {{3}} on {{4}}.",
        "sampleValues": {
          "1": "₹18,500",
          "2": "XXXX1102",
          "3": "International Merchant",
          "4": "10:45 PM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Yes, it was me",
            "value": "TXN_VALID"
          },
          {
            "type": "QUICK_REPLY",
            "text": "No, Block Card Now",
            "value": "BLOCK_CARD_URGENT"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-verification-code-otp",
    "title": "Verification code (OTP)",
    "industry": "General",
    "category": "AUTHENTICATION",
    "format": "BUTTONS_TEXT",
    "description": "Standard security OTP for two-factor verification.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "{{1}} is your verification code.",
        "sampleValues": {
          "1": "739201"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "Copy code",
            "value": "739201"
          }
        ]
      },
      {
        "language": "hi",
        "languageLabel": "हिंदी",
        "body": "{{1}} आपका सत्यापन कोड है।",
        "sampleValues": {
          "1": "739201"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "कोड कॉपी करें",
            "value": "739201"
          }
        ]
      },
      {
        "language": "gu",
        "languageLabel": "ગુજરાતી",
        "body": "{{1}} તમારો ચકાસણી કોડ છે.",
        "sampleValues": {
          "1": "739201"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "કોડ કોપી કરો",
            "value": "739201"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-opt-in-confirmed",
    "title": "Opt-in confirmed",
    "industry": "General",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Welcome and compliance opt-in confirmation.",
    "isPopular": true,
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for choosing WhatsApp updates from {{2}}. You will get order and account updates here.",
        "sampleValues": {
          "1": "Ravi",
          "2": "AutoWhats"
        }
      }
    ]
  },
  {
    "slug": "general-payment-request",
    "title": "Payment request",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Direct payment collection request with UPI/card gateway link.",
    "isPopular": true,
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, a payment of {{2}} is due for {{3}}. Pay securely using the button below.",
        "sampleValues": {
          "1": "Client",
          "2": "₹2,500",
          "3": "Invoice #401"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Securely",
            "value": "https://example.com/pay/401"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-support-ticket-update",
    "title": "Support ticket update",
    "industry": "General",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Customer helpdesk status notification.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, there is an update on your ticket ({{2}}): {{3}}. Reply here if you need anything else.",
        "sampleValues": {
          "1": "Ananya",
          "2": "#TICK-9081",
          "3": "Our engineering team has resolved the issue."
        }
      }
    ]
  },
  {
    "slug": "general-holiday-hours",
    "title": "Holiday hours",
    "industry": "General",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Store or office festive schedule update.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, wishing you a happy {{2}}! 🪔 Our store will be closed on {{3}} and open as usual the next day.",
        "sampleValues": {
          "1": "Valued Customer",
          "2": "Diwali",
          "3": "Sunday, 12th Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Shop Online",
            "value": "https://example.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-leave-us-a-review",
    "title": "Leave us a review",
    "industry": "General",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Google Maps and Trustpilot rating collection.",
    "isPopular": true,
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for being our customer! If you enjoyed our service, a quick review would mean a lot to us.",
        "sampleValues": {
          "1": "Priya"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Review on Google ⭐",
            "value": "https://g.page/r/example/review"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-login-code",
    "title": "Login code",
    "industry": "General",
    "category": "AUTHENTICATION",
    "format": "TEXT",
    "description": "Text-only authentication code with validity duration.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Your verification code is {{1}}. It expires in 10 minutes.",
        "sampleValues": {
          "1": "831094"
        }
      }
    ]
  },
  {
    "slug": "general-appointment-booked",
    "title": "Appointment booked",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Booking confirmation with date, time, and service details.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Appointment Confirmed! Hi {{1}}, your appointment for {{2}} is confirmed on {{3}} at {{4}} with {{5}}.",
        "sampleValues": {
          "1": "Raj",
          "2": "Consultation",
          "3": "Monday, 16 Nov",
          "4": "3:30 PM",
          "5": "Dr. Mehta"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Add to Calendar",
            "value": "CALENDAR_SYNC"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call Reception",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-appointment-rescheduled",
    "title": "Appointment rescheduled",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Change of booking notification.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, as requested, your appointment has been rescheduled to {{2}} at {{3}}.",
        "sampleValues": {
          "1": "Sunita",
          "2": "Thursday, 19 Nov",
          "3": "11:00 AM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Confirm Slot",
            "value": "CONFIRM_SLOT"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-service-feedback",
    "title": "Service completed feedback",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Feedback for on-site technician, home repair, or servicing.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, technician {{2}} marked your service request ({{3}}) as completed. Are you satisfied with the work done?",
        "sampleValues": {
          "1": "Deepa",
          "2": "Suresh",
          "3": "#SR-882"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "👍 Yes, Fully Satisfied",
            "value": "SATISFIED"
          },
          {
            "type": "QUICK_REPLY",
            "text": "👎 Has Issues",
            "value": "ISSUE_REPORT"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-meeting-reminder",
    "title": "Meeting link & reminder",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Zoom / Google Meet link dispatch 15 minutes before meeting.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your meeting \"{{2}}\" starts in 15 minutes at {{3}}. Click below to join the video call.",
        "sampleValues": {
          "1": "Rohit",
          "2": "Project Demo & Q&A",
          "3": "4:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Join Video Call",
            "value": "https://meet.google.com/abc-defg-hij"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-welcome-community",
    "title": "Welcome to community",
    "industry": "General",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Welcome onboard for new members or subscribers.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Welcome aboard {{1}}! 🎉 We are thrilled to have you in the {{2}} family. Here is your starter guide to get the most out of our tools.",
        "sampleValues": {
          "1": "Kunal",
          "2": "AutoWhats"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Read Quickstart Guide",
            "value": "https://example.com/docs"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-maintenance-notice",
    "title": "System maintenance notice",
    "industry": "General",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Scheduled infrastructure upgrade notification.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, our systems will undergo scheduled maintenance on {{2}} between {{3}}. Services will resume normally immediately afterwards.",
        "sampleValues": {
          "1": "Valued Client",
          "2": "Saturday, 21 Nov",
          "3": "2:00 AM - 4:00 AM"
        }
      }
    ]
  },
  {
    "slug": "general-password-reset",
    "title": "Password reset link",
    "industry": "General",
    "category": "AUTHENTICATION",
    "format": "BUTTONS_TEXT",
    "description": "Secure account recovery link.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, we received a password reset request for your account. If this was you, click below to set a new password. Link valid for {{2}} mins.",
        "sampleValues": {
          "1": "Sameer",
          "2": "15"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Reset Password",
            "value": "https://example.com/reset-password"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-job-application",
    "title": "Job application received",
    "industry": "General",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Recruitment acknowledgement for applicants.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for applying for the position of {{2}} at {{3}}. Our recruitment team is reviewing your profile and will be in touch soon.",
        "sampleValues": {
          "1": "Anjali",
          "2": "Frontend Engineer",
          "3": "TechCorp"
        }
      }
    ]
  },
  {
    "slug": "general-interview-invite",
    "title": "Interview invitation",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Interview round scheduling for shortlisted candidates.",
    "order": 16,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Congratulations {{1}}! You have been shortlisted for an interview for {{2}} with {{3}} on {{4}} at {{5}}.",
        "sampleValues": {
          "1": "Vivek",
          "2": "Product Manager",
          "3": "Hiring Team",
          "4": "Tomorrow",
          "5": "2:30 PM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "✓ Confirm Time Slot",
            "value": "CONFIRM_INTERVIEW"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Reschedule",
            "value": "RESCHEDULE_INTERVIEW"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-warranty-registered",
    "title": "Warranty registered",
    "industry": "General",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Electronic product warranty confirmation certificate.",
    "order": 17,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your product {{2}} (Serial: {{3}}) has been successfully registered with a {{4}} warranty valid until {{5}}.",
        "sampleValues": {
          "1": "Ramesh",
          "2": "Smart TV 55\"",
          "3": "SN-99182",
          "4": "2 Years",
          "5": "Nov 2028"
        }
      }
    ]
  },
  {
    "slug": "general-newsletter-digest",
    "title": "Newsletter digest",
    "industry": "General",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Weekly curated industry insights and top articles.",
    "order": 18,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80"
        },
        "body": "This Week in Tech 🚀 Hi {{1}}, here are the 3 biggest stories shaping AI and automation this week. Read the full briefing below.",
        "sampleValues": {
          "1": "Techie"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Read Full Digest",
            "value": "https://example.com/blog"
          }
        ]
      }
    ]
  },
  {
    "slug": "general-office-directions",
    "title": "Office address & directions",
    "industry": "General",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Location map and contact person details for visitors.",
    "order": 19,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Looking forward to meeting you, {{1}}! Our office is located at {{2}}. Nearest landmark: {{3}}.",
        "sampleValues": {
          "1": "Guest",
          "2": "Tower B, 4th Floor, Tech Hub",
          "3": "Metro Station Gate 2"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Open in Google Maps",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-appointment-booked",
    "title": "Salon appointment booked",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Hair, beauty, or spa reservation confirmation.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your appointment for {{2}} is confirmed on {{3}} at {{4}} with stylist {{5}}.",
        "sampleValues": {
          "1": "Natasha",
          "2": "Hair Spa & Cut",
          "3": "Saturday",
          "4": "4:00 PM",
          "5": "Zara"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Services",
            "value": "https://example.com/salon"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call Salon",
            "phoneNumber": "+919876512345"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-rebooking-reminder",
    "title": "Rebooking reminder",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "4-week hair or skin care touchup reminder.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, it has been 4 weeks since your last visit! Time for a hair touchup or relaxing massage? Book this week for {{2}} off.",
        "sampleValues": {
          "1": "Kajal",
          "2": "15%"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Book My Slot",
            "value": "BOOK_SALON_SLOT"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-appointment-confirmation",
    "title": "Doctor appointment confirmed",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Patient OPD or consultation booking alert.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, your consultation with {{2}} is confirmed for {{3}} at {{4}}. Token Number: {{5}}.",
        "sampleValues": {
          "1": "Mrs. Gupta",
          "2": "Dr. Alok Verma",
          "3": "Tomorrow",
          "4": "10:30 AM",
          "5": "#14"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Clinic Location",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-lab-report-ready",
    "title": "Lab reports ready",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Pathology diagnostic test report PDF delivery.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/lab-report.pdf"
        },
        "body": "Dear {{1}}, your test results for ({{2}}) are ready. Please find the verified medical report attached.",
        "sampleValues": {
          "1": "Patient",
          "2": "Complete Blood Count"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Book Consultation",
            "value": "https://example.com/consult"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-class-schedule",
    "title": "Live class schedule",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Live lecture link and syllabus topic notice.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your live lecture on \"{{2}}\" by {{3}} starts at {{4}}. Be ready with your notebook!",
        "sampleValues": {
          "1": "Student",
          "2": "Calculus & Vectors",
          "3": "Prof. Sharma",
          "4": "6:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Join Live Class",
            "value": "https://example.com/live"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-fee-due-reminder",
    "title": "Tuition fee due",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Quarterly school or coaching fee reminder.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear Parent, fee of {{1}} for {{2}} (Grade: {{3}}) is due on {{4}}. Pay online to avoid late penalties.",
        "sampleValues": {
          "1": "₹12,000",
          "2": "Aarav Sharma",
          "3": "Class 10",
          "4": "10 Nov 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay School Fee",
            "value": "https://example.com/fee"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-site-visit-booked",
    "title": "Site visit booked",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Project, date and time of a booked property site visit.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your site visit to {{2}} is booked for {{3}} at {{4}}. Our executive will meet you at the site office.",
        "sampleValues": {
          "1": "Rahul",
          "2": "Green Valley Phase 2",
          "3": "2 Nov",
          "4": "11:00 AM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Get directions",
            "value": "https://maps.google.com"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call executive",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-brochure-download",
    "title": "Property brochure PDF",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Floor plans, price list, and brochure sharing.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/property-brochure.pdf"
        },
        "body": "Hi {{1}}, thank you for showing interest in {{2}}! Attached is the official brochure with floor plans and pricing.",
        "sampleValues": {
          "1": "Investor",
          "2": "Skyline Luxury Towers"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Schedule Site Visit",
            "value": "SCHEDULE_VISIT"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-flight-boarding-pass",
    "title": "Flight & hotel booking confirmed",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "PNR, hotel reservation and itinerary sharing.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Booking Confirmed! ✈️ Hi {{1}}, your trip to {{2}} is confirmed for {{3}}. Booking Reference: {{4}}.",
        "sampleValues": {
          "1": "Traveler",
          "2": "Goa",
          "3": "24-28 Dec",
          "4": "GOA-9012"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download Tickets",
            "value": "https://example.com/tickets"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-holiday-package",
    "title": "Holiday package offer",
    "industry": "Travel",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "International & domestic vacation deals.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80"
        },
        "body": "Explore Dubai this New Year! 🌴 5 Nights / 6 Days all-inclusive package starting from {{1}} per person.",
        "sampleValues": {
          "1": "₹39,990"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Itinerary",
            "value": "https://example.com/dubai"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-ticket-qr",
    "title": "Event ticket & pass",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Concert, exhibition, or summit entry pass.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Your ticket for {{1}} is confirmed! 🎟️ Date: {{2}} at {{3}}. Please show this message at the entry gate.",
        "sampleValues": {
          "1": "Sunburn Music Festival",
          "2": "31 Dec 2026",
          "3": "Gate 3"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download QR Pass",
            "value": "https://example.com/pass"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-consultation-booked",
    "title": "Consultation confirmed",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Legal, CA, or business consultation booking.",
    "isPopular": true,
    "order": 1,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your consultation on {{2}} is confirmed on {{3}} at {{4}}. Please have your documents ready.",
        "sampleValues": {
          "1": "Advocate Joshi",
          "2": "Trademark Registration",
          "3": "Wednesday",
          "4": "4:30 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Meeting Room",
            "value": "https://example.com/meet"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-haircut-styling-reminder",
    "title": "Haircut & styling appointment",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Upcoming haircut, blow-dry or hair spa reminder.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, this is a friendly reminder for your hair styling appointment on {{2}} at {{3}} with {{4}}.",
        "sampleValues": {
          "1": "Ananya",
          "2": "Tomorrow",
          "3": "4:00 PM",
          "4": "Master Stylist Rohan"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Confirm",
            "value": "CONFIRM"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Reschedule",
            "value": "RESCHEDULE"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-bridal-package-offer",
    "title": "Bridal makeup package offer",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Pre-bridal and wedding makeover deals.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=80"
        },
        "body": "Make your big day unforgettable! 👰 Book your complete bridal makeover package and enjoy {{1}} off plus a complimentary facial.",
        "sampleValues": {
          "1": "20%"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Bridal Lookbook",
            "value": "https://example.com/bridal"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Book Consultation",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-membership-renewal",
    "title": "Spa membership renewal",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Annual or quarterly salon club renewal alert.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your {{2}} membership expires on {{3}}. Renew before expiry to retain your {{4}} discount across all services.",
        "sampleValues": {
          "1": "Siddharth",
          "2": "Gold Spa Club",
          "3": "15 Dec",
          "4": "25%"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Renew Membership",
            "value": "https://example.com/membership"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-nail-art-confirmation",
    "title": "Nail art & gel extension booked",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Manicure, pedicure, and nail extensions booking.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your nail styling session is confirmed for {{2}} at {{3}}. We look forward to creating your dream look! 💅",
        "sampleValues": {
          "1": "Kavya",
          "2": "Saturday",
          "3": "2:30 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Directions",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-birthday-pampering",
    "title": "Birthday pampering voucher",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Special birthday discount and free add-on.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Happy Birthday {{1}}! 🎂 Celebrate your special week with a complimentary scalp massage or {{2}} off any treatment. Valid till {{3}}.",
        "sampleValues": {
          "1": "Pooja",
          "2": "₹500",
          "3": "end of this month"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Birthday Treat",
            "value": "https://example.com/birthday"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-monsoon-hair-treatment",
    "title": "Hair spa & botox offer",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Keratin, smoothening, and deep conditioning promo.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=600&q=80"
        },
        "body": "Say goodbye to frizz! ✨ Get our premium Keratin & Deep Conditioning Hair Spa at flat {{1}} this week only.",
        "sampleValues": {
          "1": "₹1,999"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Book Now",
            "value": "BOOK_HAIR_SPA"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-reschedule-appointment",
    "title": "Reschedule salon appointment",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Change time or date easily via one tap.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, need to change your appointment for {{2}}? Tap below to pick another convenient slot instantly.",
        "sampleValues": {
          "1": "Meera",
          "2": "Friday 5:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pick New Slot",
            "value": "https://example.com/reschedule"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Call Desk",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-post-service-feedback",
    "title": "Service feedback & rating",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Post-visit rating buttons.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for visiting {{2}} today! How was your experience with {{3}}?",
        "sampleValues": {
          "1": "Simran",
          "2": "Glow Lounge",
          "3": "our team"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Loved it! ⭐",
            "value": "RATE_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "It was okay",
            "value": "RATE_3"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Needs improvement",
            "value": "RATE_1"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-festive-skin-glow",
    "title": "Festive glow facial package",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Hydra-facial and golden glow seasonal package.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80"
        },
        "body": "Get festive ready with our 7-step Diamond Glow facial! ✨ Book before {{1}} and get free de-tan pack worth {{2}}.",
        "sampleValues": {
          "1": "Sunday",
          "2": "₹800"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Explore Packages",
            "value": "https://example.com/glow"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-referral-coupon",
    "title": "Friend referral discount",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Give ₹500, get ₹500 friend referral.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Love your new look? 💇 Share the love! Refer a friend with code {{1}} — they get {{2}} off their first visit, and you get {{3}} credit.",
        "sampleValues": {
          "1": "GLOW500",
          "2": "₹500",
          "3": "₹500"
        },
        "buttons": [
          {
            "type": "COPY_CODE",
            "text": "Copy Referral Code",
            "value": "GLOW500"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-stylist-assignment",
    "title": "Stylist assigned update",
    "industry": "Salon & spa",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Notification of senior artist assigned.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, {{2}} has been assigned as your lead stylist for your appointment on {{3}} at {{4}}. See you soon!",
        "sampleValues": {
          "1": "Ritu",
          "2": "Sanya (Senior Colorist)",
          "3": "Wednesday",
          "4": "11:00 AM"
        }
      }
    ]
  },
  {
    "slug": "salon-product-refill-alert",
    "title": "Haircare product refill alert",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Shampoo and serum replenishment reminder.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, running low on your {{2}}? Re-order today with code {{3}} for flat 15% off plus free home delivery.",
        "sampleValues": {
          "1": "Aisha",
          "2": "Argan Repair Shampoo & Mask",
          "3": "REFILL15"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Reorder Now",
            "value": "https://example.com/shop"
          }
        ]
      }
    ]
  },
  {
    "slug": "salon-vip-preview-night",
    "title": "VIP member exclusive preview",
    "industry": "Salon & spa",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Private event or new service launch invitation.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=600&q=80"
        },
        "body": "Dear {{1}}, you are cordially invited to our exclusive preview of {{2}} on {{3}}. Enjoy complimentary champagne and mini-treatments.",
        "sampleValues": {
          "1": "Tara",
          "2": "Korean Glass Skin Clinic",
          "3": "Thursday at 6:00 PM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "RSVP Yes",
            "value": "RSVP_YES"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Cannot attend",
            "value": "RSVP_NO"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-doctor-consultation-confirmed",
    "title": "Doctor consultation confirmed",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "OPD booking with doctor name and room number.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Your appointment with Dr. {{1}} ({{2}}) is confirmed for {{3}} at {{4}}. Room: {{5}}. Please arrive 10 minutes early.",
        "sampleValues": {
          "1": "Arjun Mehta",
          "2": "Cardiologist",
          "3": "Tomorrow",
          "4": "10:30 AM",
          "5": "OPD 204"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Clinic Location",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-home-sample-collection",
    "title": "Lab sample collection scheduled",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Phlebotomist visit for home blood test.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, our phlebotomist {{2}} (Ph: {{3}}) is assigned for your {{4}} blood sample collection on {{5}} between 7:00 AM - 8:00 AM. Fasting required: 10-12 hours.",
        "sampleValues": {
          "1": "Ramesh Kumar",
          "2": "Vinay",
          "3": "+919876543210",
          "4": "Full Body Health Checkup",
          "5": "12 Nov"
        }
      }
    ]
  },
  {
    "slug": "clinic-prescription-directions",
    "title": "Prescription & medication directions",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Digital Rx PDF and dosage guidelines.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/prescription.pdf"
        },
        "body": "Hi {{1}}, attached is your digital prescription from Dr. {{2}}. Order genuine medicines with home delivery via the link below.",
        "sampleValues": {
          "1": "Sunita",
          "2": "Sharma"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Order Medicines Online",
            "value": "https://example.com/pharmacy"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-preventive-health-package",
    "title": "Annual preventive health checkup",
    "industry": "Clinic & healthcare",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Comprehensive 64-test health screening promo.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&q=80"
        },
        "body": "Prioritize your family’s health! 🩺 Book our Comprehensive 64-Test Body Checkup (Blood, Heart, Liver, Kidney) for just {{1}} (MRP {{2}}).",
        "sampleValues": {
          "1": "₹999",
          "2": "₹3,500"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Book Health Package",
            "value": "https://example.com/healthcheck"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-dental-checkup-reminder",
    "title": "Routine dental clean-up reminder",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "6-month dental scaling & examination reminder.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, it has been 6 months since your last dental cleaning! Keep your smile healthy by booking your routine scaling session.",
        "sampleValues": {
          "1": "Deepak"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Book Dental Visit 🦷",
            "value": "BOOK_DENTAL"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-vaccination-dose-due",
    "title": "Childhood & adult vaccination due",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Immunization reminder for children and seniors.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, the {{2}} dose for {{3}} is scheduled on {{4}}. Keeping vaccinations on schedule ensures timely immunity.",
        "sampleValues": {
          "1": "Parent",
          "2": "MMR Booster",
          "3": "Advik",
          "4": "20 Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Schedule Vaccine",
            "value": "https://example.com/vaccine"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-teleconsultation-link",
    "title": "Video doctor call joining link",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Secure teleconsultation video room link.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your video consultation with Dr. {{2}} starts in 10 minutes at {{3}}. Tap below to join the secure consultation room.",
        "sampleValues": {
          "1": "Harish",
          "2": "Patel",
          "3": "5:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Join Video Consultation 🎥",
            "value": "https://telehealth.example.com/room/491"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-eye-examination-booking",
    "title": "Eye examination confirmed",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Vision test and ophthalmologist visit.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your comprehensive eye test is booked at {{2}} for {{3}} at {{4}}. Please carry your current eyeglasses.",
        "sampleValues": {
          "1": "Sneha",
          "2": "Vision Care Center",
          "3": "Thursday",
          "4": "3:15 PM"
        }
      }
    ]
  },
  {
    "slug": "clinic-lab-report-delay-notice",
    "title": "Lab report processing update",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Notification for cultures or specialized pathology.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, your test results for {{2}} (Ref: {{3}}) are currently under secondary pathologist verification. Your report will be ready by {{4}}.",
        "sampleValues": {
          "1": "Kiran",
          "2": "Thyroid Profile",
          "3": "#PATH-9941",
          "4": "8:00 PM today"
        }
      }
    ]
  },
  {
    "slug": "clinic-dietician-followup",
    "title": "Diet & nutrition review",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Weekly diet chart progress review.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, how did Week {{2}} of your customized meal plan go? Your nutritionist {{3}} is ready for your weekly check-in.",
        "sampleValues": {
          "1": "Neha",
          "2": "3",
          "3": "Dt. Anjali"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Share Weight & Log",
            "value": "SHARE_PROGRESS"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-chronic-medicine-refill",
    "title": "Monthly prescription refill reminder",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Hypertension, diabetes, thyroid monthly medicine reminder.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your regular monthly supply of {{2}} is due for a refill. Tap below to reorder with free doorstep delivery.",
        "sampleValues": {
          "1": "Mr. Gupta",
          "2": "Metformin & Telmisartan"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "1-Click Refill",
            "value": "https://example.com/refill"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-doctor-reschedule-alert",
    "title": "Doctor emergency reschedule alert",
    "industry": "Clinic & healthcare",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Urgent notice when doctor called into surgery.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, Dr. {{2}} has been called into an emergency procedure. We apologize for the inconvenience. Would you prefer a new slot or an alternate doctor?",
        "sampleValues": {
          "1": "Patient",
          "2": "Verma"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Reschedule Slot",
            "value": "RESCHEDULE"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Alternate Doctor",
            "value": "ALT_DOCTOR"
          }
        ]
      }
    ]
  },
  {
    "slug": "clinic-senior-citizen-health-camp",
    "title": "Senior citizen wellness camp invitation",
    "industry": "Clinic & healthcare",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Free bone density & ECG community camp.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=600&q=80"
        },
        "body": "Free Senior Citizen Wellness Camp! 🏥 On {{1}}, get free Bone Density Test, ECG, Blood Sugar, and Senior Physician Consultation at {{2}}.",
        "sampleValues": {
          "1": "Sunday, 18th Nov",
          "2": "City Care Hospital"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Register Free",
            "value": "https://example.com/camp"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-exam-timetable",
    "title": "Exam schedule & date sheet",
    "industry": "Education",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Mid-term or board examination date sheet PDF.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/datesheet.pdf"
        },
        "body": "Dear Parent/Student, the examination schedule for {{1}} ({{2}}) has been published. Please review the attached timetable.",
        "sampleValues": {
          "1": "Term 1 Final Exams",
          "2": "Grade 10 & 12"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Guidelines",
            "value": "https://example.com/exam-rules"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-ptm-schedule",
    "title": "Parent-Teacher Meeting (PTM) slot",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Book or confirm one-on-one parent meeting slot.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, the Parent-Teacher Meeting for {{2}} is on {{3}}. Your dedicated slot with the class teacher is {{4}}.",
        "sampleValues": {
          "1": "Mrs. Rao",
          "2": "Kabir",
          "3": "Saturday, 14 Nov",
          "4": "10:15 AM - 10:30 AM"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Confirm Attendance",
            "value": "CONFIRM"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Request Slot Change",
            "value": "CHANGE_SLOT"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-admission-form-received",
    "title": "Admission application received",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Acknowledgement of university or school enrollment.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, we have received your application for {{2}} (Application No: {{3}}). Track your admission status online.",
        "sampleValues": {
          "1": "Aryan",
          "2": "B.Tech Computer Science",
          "3": "#APP-2026-9041"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Track Status",
            "value": "https://example.com/admissions"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-webinar-joining-link",
    "title": "Live online masterclass link",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Webinar or batch lecture link.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your live masterclass \"{{2}}\" starts in 15 minutes at {{3}}. Tap below to join on Zoom.",
        "sampleValues": {
          "1": "Siddharth",
          "2": "Mastering Data Structures",
          "3": "7:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Join Live Session 🎓",
            "value": "https://zoom.us/j/123456789"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-student-absence-alert",
    "title": "Student absence notification",
    "industry": "Education",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Morning biometric or attendance alert to parents.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear Parent, your ward {{1}} (Roll No: {{2}}, Class: {{3}}) was marked absent today ({{4}}). Please reply to this message if an official leave was submitted.",
        "sampleValues": {
          "1": "Tanvi Shah",
          "2": "24",
          "3": "Grade 8-B",
          "4": "12 Nov 2026"
        }
      }
    ]
  },
  {
    "slug": "education-report-card-published",
    "title": "Term report card & performance",
    "industry": "Education",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Secure digital report card PDF download.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/report-card.pdf"
        },
        "body": "Dear Parent, the Term {{1}} Report Card for {{2}} is ready. Download the document to review subject grades and remarks.",
        "sampleValues": {
          "1": "1",
          "2": "Vivaan"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Performance Portal",
            "value": "https://example.com/portal"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-coaching-early-bird",
    "title": "Early bird coaching discount",
    "industry": "Education",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "JEE, NEET or UPSC batch launch offer.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Ace {{1}} with top rankers! 🚀 Admissions open for our 2027 foundation batch. Enroll before {{2}} to get flat {{3}} early-bird scholarship.",
        "sampleValues": {
          "1": "NEET 2027",
          "2": "30 Nov",
          "3": "₹15,000"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Scholarship",
            "value": "https://example.com/scholarship"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-course-certificate",
    "title": "Course certificate of completion",
    "industry": "Education",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Issued certificate with credential ID.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/certificate.pdf"
        },
        "body": "Congratulations {{1}}! 🎓 You have successfully completed \"{{2}}\". Attached is your verifiable certificate of completion.",
        "sampleValues": {
          "1": "Aditi Rao",
          "2": "Full Stack Web Development Bootcamp"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Add to LinkedIn",
            "value": "https://linkedin.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-assignment-submission-reminder",
    "title": "Assignment deadline reminder",
    "industry": "Education",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Deadline reminder for homework or project.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Reminder: Assignment \"{{1}}\" for {{2}} is due tomorrow at {{3}}. Late submissions will incur grade deductions.",
        "sampleValues": {
          "1": "Calculus Problem Set 4",
          "2": "Mathematics",
          "3": "11:59 PM"
        }
      }
    ]
  },
  {
    "slug": "education-placement-drive-alert",
    "title": "Campus placement drive schedule",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Recruitment drive notice for graduating batches.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Attention Students: {{1}} is conducting on-campus recruitment for {{2}} with package of {{3}}. Register before {{4}}.",
        "sampleValues": {
          "1": "Google India",
          "2": "Associate Software Engineer",
          "3": "₹18 LPA",
          "4": "5:00 PM today"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Submit Resume",
            "value": "https://placement.example.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-school-bus-tracking",
    "title": "School bus live GPS tracking",
    "industry": "Education",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Live bus location alert for parents.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear Parent, Bus No. {{1}} carrying {{2}} has departed from campus. Estimated arrival at your stop is {{3}}.",
        "sampleValues": {
          "1": "14-B",
          "2": "Kavya",
          "3": "3:45 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Track Bus Live 🚌",
            "value": "https://tracker.example.com/bus14b"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-summer-camp-promo",
    "title": "Summer robotics & coding camp",
    "industry": "Education",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Holiday enrichment workshop announcement.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&q=80"
        },
        "body": "Spark your child’s creativity this summer! 🤖 2-week hands-on Robotics, AI & Game Building Camp for ages {{1}}. Limited slots per batch.",
        "sampleValues": {
          "1": "8-14 years"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Curriculum & Fees",
            "value": "https://example.com/summer-camp"
          }
        ]
      }
    ]
  },
  {
    "slug": "education-mock-test-score",
    "title": "Mock test result & analysis",
    "industry": "Education",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Detailed score breakdown and rank.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your score for {{2}} is {{3}}/{{4}} (Percentile: {{5}}). Review your detailed question analysis in your dashboard.",
        "sampleValues": {
          "1": "Manish",
          "2": "All India JEE Mock #3",
          "3": "248",
          "4": "300",
          "5": "98.6%"
        }
      }
    ]
  },
  {
    "slug": "realestate-new-launch-announcement",
    "title": "New luxury project pre-launch",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Exclusive pre-launch investor invitation.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80"
        },
        "body": "Introducing {{1}} 🏙️ Ultra-luxury 3 & 4 BHK residences starting at {{2}}. Enjoy pre-launch pricing and zero stamp duty before {{3}}.",
        "sampleValues": {
          "1": "Skyline Grandeur",
          "2": "₹1.85 Cr",
          "3": "30 Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Master Plan",
            "value": "https://example.com/luxury"
          },
          {
            "type": "PHONE_NUMBER",
            "text": "Speak to Sales",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-token-booking-receipt",
    "title": "Token payment confirmation",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Booking amount receipt and unit allotment.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Congratulations {{1}}! Token payment of {{2}} for Unit {{3}} at {{4}} has been confirmed. Receipt Ref: {{5}}.",
        "sampleValues": {
          "1": "Naveen Jain",
          "2": "₹1,00,000",
          "3": "Tower B - 1402",
          "4": "Oasis Greens",
          "5": "#REC-8921"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download Receipt",
            "value": "https://example.com/receipts"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-construction-milestone",
    "title": "Construction progress update",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Monthly construction site photos and status.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1541888946425-d0fbb186c5f8?w=600&q=80"
        },
        "body": "Dear {{1}}, here is the monthly construction update for {{2}} (Unit: {{3}}). {{4}} slab casting has been successfully completed.",
        "sampleValues": {
          "1": "Homebuyer",
          "2": "Park Avenue Phase 1",
          "3": "C-604",
          "4": "12th Floor"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View 360 Drone Video",
            "value": "https://example.com/progress"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-sale-agreement-registered",
    "title": "Sale agreement registered",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Legal document registration completion notice.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, your Agreement for Sale for {{2}} (Unit {{3}}) has been officially registered with the Sub-Registrar office. Registration No: {{4}}.",
        "sampleValues": {
          "1": "Suresh Reddy",
          "2": "Urban Heights",
          "3": "Flat 801",
          "4": "#REG/2026/0942"
        }
      }
    ]
  },
  {
    "slug": "realestate-home-loan-assistance",
    "title": "Home loan pre-approval assistance",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Tie-ups with SBI, HDFC, ICICI at special interest rates.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, get your dream home with low interest rates starting from {{2}} p.a. Our partner banks offer instant in-principle approval with zero processing fee.",
        "sampleValues": {
          "1": "Buyer",
          "2": "8.25%"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Check Loan Eligibility",
            "value": "https://example.com/homeloan"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-possession-date-notice",
    "title": "Property handover & possession notice",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Key handover invite and final inspection.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Welcome to your new home! 🏡 Possession for {{1}} (Unit: {{2}}) begins on {{3}}. Book your final walkthrough and key handover slot.",
        "sampleValues": {
          "1": "Serene Meadows",
          "2": "Villa 22",
          "3": "15 Dec 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Book Handover Slot",
            "value": "https://example.com/handover"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-lease-renewal-reminder",
    "title": "Rental lease renewal reminder",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "11-month rent agreement expiry alert.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your rental lease for {{2}} expires in 30 days ({{3}}). Please let us know if you wish to renew or schedule move-out.",
        "sampleValues": {
          "1": "Tenant",
          "2": "Flat 302, Palm Breeze",
          "3": "31 Dec"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Renew Lease",
            "value": "RENEW_LEASE"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Moving Out",
            "value": "MOVE_OUT"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-maintenance-dues-alert",
    "title": "Society maintenance bill reminder",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Monthly or quarterly society maintenance dues.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear Resident, maintenance dues of {{1}} for {{2}} for the month of {{3}} are due on {{4}}. Pay online to avoid late interest.",
        "sampleValues": {
          "1": "₹4,500",
          "2": "Flat 503",
          "3": "November",
          "4": "10 Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Maintenance",
            "value": "https://example.com/society-pay"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-festive-price-discount",
    "title": "Festive property price reduction",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Diwali/New Year festive discounts on ready units.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80"
        },
        "body": "Diwali Special Offer! 🪔 Save up to {{1}} on ready-to-move-in 2 & 3 BHK homes at {{2}}. Modular kitchen & gold coin included on spot booking.",
        "sampleValues": {
          "1": "₹5 Lakhs",
          "2": "Emerald Heights"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Claim Festive Offer",
            "value": "https://example.com/festive-homes"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-virtual-tour-invite",
    "title": "Virtual 3D walkthrough invitation",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Interactive VR model flat walkthrough.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Explore our model sample flat from the comfort of your couch! 📱 Take a guided 3D virtual tour of {{1}} ({{2}}).",
        "sampleValues": {
          "1": "The Lumina 3BHK",
          "2": "1650 sq.ft"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Start 3D Tour 🏠",
            "value": "https://matterport.example.com/lumina"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-walkthrough-schedule",
    "title": "Key handover appointment confirmed",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Pre-handover snagging and inspection.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your flat inspection & snagging session for {{2}} is confirmed on {{3}} at {{4}}. Our civil engineer will accompany you.",
        "sampleValues": {
          "1": "Amitabh",
          "2": "Unit B-901",
          "3": "Saturday",
          "4": "2:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Inspection Checklist",
            "value": "https://example.com/checklist"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-commercial-office-inquiry",
    "title": "Commercial office space follow-up",
    "industry": "Real estate",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Corporate leasing and retail space follow-up.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, thank you for inquiring about commercial office spaces in {{2}} ({{3}} sq.ft). Would you like to schedule an on-site visit or discuss lease terms?",
        "sampleValues": {
          "1": "Rajesh",
          "2": "Cyber City Phase 2",
          "3": "5,000 - 12,000"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Schedule Visit",
            "value": "VISIT"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Send Lease Terms",
            "value": "TERMS"
          }
        ]
      }
    ]
  },
  {
    "slug": "realestate-investor-rental-yield",
    "title": "Investor rental yield & ROI report",
    "industry": "Real estate",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "High rental yield studio apartments analysis.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/roi-report.pdf"
        },
        "body": "Earn {{1}} guaranteed rental yield! 📈 Discover pre-leased commercial and studio apartments in {{2}}. Download the investor deck.",
        "sampleValues": {
          "1": "8.5%",
          "2": "Hiranandani Tech Zone"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download Investor Deck",
            "value": "https://example.com/investor"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-flight-web-checkin",
    "title": "Flight web check-in reminder",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Direct link to airline boarding pass generation.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, web check-in is now open for your flight {{2}} (PNR: {{3}}) from {{4}} to {{5}}. Select your preferred seat now.",
        "sampleValues": {
          "1": "Priya",
          "2": "6E 542",
          "3": "X7K9LP",
          "4": "DEL",
          "5": "BOM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Check-in Now ✈️",
            "value": "https://airline.example.com/checkin"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-cab-driver-assigned",
    "title": "Airport cab pickup & driver details",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Driver phone number, car number, and OTP.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your airport transfer cab is assigned! Driver: {{2}} ({{3}}). Vehicle: {{4}} ({{5}}). Start OTP: {{6}}.",
        "sampleValues": {
          "1": "Rohan",
          "2": "Sanjay",
          "3": "+919876543210",
          "4": "Toyota Innova Crysta",
          "5": "MH-02-EE-8899",
          "6": "4912"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Driver",
            "phoneNumber": "+919876543210"
          },
          {
            "type": "URL",
            "text": "Track Cab Live",
            "value": "https://cab.example.com/track"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-hotel-checkin-voucher",
    "title": "Hotel reservation voucher",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Hotel voucher with check-in time and amenities.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/hotel-voucher.pdf"
        },
        "body": "Hi {{1}}, your stay at {{2}} is confirmed from {{3}} to {{4}}. Booking ID: {{5}}. Attached is your check-in voucher.",
        "sampleValues": {
          "1": "Anil Kapoor",
          "2": "Taj Fort Aguada, Goa",
          "3": "22 Dec",
          "4": "26 Dec",
          "5": "#HTL-90412"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Hotel Location",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-visa-approval-download",
    "title": "Visa approved notification",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "E-visa approval letter and validity dates.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Great news {{1}}! Your tourist visa for {{2}} has been approved. Visa Reference: {{3}}. Valid until: {{4}}.",
        "sampleValues": {
          "1": "Karan",
          "2": "Schengen (France)",
          "3": "#FR-VISA-8821",
          "4": "30 Mar 2027"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download E-Visa",
            "value": "https://example.com/visa"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-weekend-getaway-discount",
    "title": "Weekend getaway resort offer",
    "industry": "Travel",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Luxury villa & resort weekend escape deal.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&q=80"
        },
        "body": "Need a break? 🌿 Escape to luxury pool villas in {{1}} this weekend! Flat {{2}} off with code {{3}}. Free breakfast & high tea included.",
        "sampleValues": {
          "1": "Lonavala & Alibaug",
          "2": "25%",
          "3": "ESCAPE25"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Book Weekend Stay",
            "value": "https://example.com/villas"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-insurance-policy-copy",
    "title": "Overseas travel insurance policy",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Medical and baggage coverage document.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/travel-insurance.pdf"
        },
        "body": "Hi {{1}}, your international travel insurance for your trip to {{2}} is active. Policy Number: {{3}}. 24/7 Global Helpline: {{4}}.",
        "sampleValues": {
          "1": "Deepa",
          "2": "Europe",
          "3": "#TI-908123",
          "4": "+1-800-555-0199"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Emergency Helpline",
            "phoneNumber": "+18005550199"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-flight-delay-notice",
    "title": "Flight rescheduled / gate change",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Real-time gate and departure adjustment alert.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Flight Update: Flight {{1}} to {{2}} is now scheduled to depart at {{3}} (Delayed by {{4}} mins). Boarding Gate: {{5}}.",
        "sampleValues": {
          "1": "AI 804",
          "2": "London Heathrow",
          "3": "11:45 AM",
          "4": "45",
          "5": "Gate 18A"
        }
      }
    ]
  },
  {
    "slug": "travel-cruise-early-bird",
    "title": "Luxury cruise early-bird offer",
    "industry": "Travel",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "All-inclusive international ocean cruise offer.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=600&q=80"
        },
        "body": "Sail into the high seas! 🚢 Cordelia Cruise Singapore to Malaysia (4 Nights) starting at {{1}} per person. Free onboard casino credits included.",
        "sampleValues": {
          "1": "₹28,500"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Cruise Itinerary",
            "value": "https://example.com/cruise"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-baggage-guidelines",
    "title": "Baggage allowance & guidelines",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Cabin and check-in weight limits reminder.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, here is the baggage allowance for your trip on {{2}}: Cabin bag: {{3}} kg, Check-in bag: {{4}} kg. Excess baggage fees apply at the airport.",
        "sampleValues": {
          "1": "Aditya",
          "2": "Indigo 6E 102",
          "3": "7",
          "4": "15"
        }
      }
    ]
  },
  {
    "slug": "travel-tour-guide-contact",
    "title": "Local tour guide assigned",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Local contact and meeting point info.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your local guide for your {{2}} day-tour is {{3}} (Ph: {{4}}). Meeting point: {{5}} at {{6}}.",
        "sampleValues": {
          "1": "Sunil",
          "2": "Jaipur Heritage Palace Tour",
          "3": "Raghav",
          "4": "+919876543210",
          "5": "Hawa Mahal Main Gate",
          "6": "9:00 AM"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Tour Guide",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-forex-card-reload",
    "title": "Forex travel card reloaded",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Currency reload confirmation alert.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Your Multi-Currency Forex Card (ending {{1}}) has been reloaded with {{2}} {{3}}. Current exchange rate applied: {{4}}.",
        "sampleValues": {
          "1": "8841",
          "2": "USD",
          "3": "2,000",
          "4": "₹84.15 / USD"
        }
      }
    ]
  },
  {
    "slug": "travel-post-trip-review",
    "title": "Post-vacation feedback & review",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Trip satisfaction rating.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Welcome home {{1}}! We hope you had a magical trip to {{2}}. How was your travel experience with our team?",
        "sampleValues": {
          "1": "Pooja",
          "2": "Switzerland & Paris"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Amazing! ⭐⭐⭐⭐⭐",
            "value": "RATE_5"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Good experience",
            "value": "RATE_4"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Need to discuss",
            "value": "FEEDBACK"
          }
        ]
      }
    ]
  },
  {
    "slug": "travel-group-tour-assembly",
    "title": "Group tour departure assembly info",
    "industry": "Travel",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Bus departure and tour manager contact.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Attention Group Travelers: Tour bus for {{1}} will depart promptly at {{2}} from {{3}}. Tour Manager {{4}} will coordinate boarding.",
        "sampleValues": {
          "1": "Kedarnath Yatra Batch 4",
          "2": "5:30 AM",
          "3": "Haridwar Railway Station",
          "4": "Manoj Sharma"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Tour Manager",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-wedding-rsvp-confirmation",
    "title": "Wedding invitation & RSVP confirmation",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Digital wedding invite with guest RSVP buttons.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Together with their families, {{1}} & {{2}} invite you to celebrate their wedding on {{3}} at {{4}}. Please confirm your RSVP below.",
        "sampleValues": {
          "1": "Rohit",
          "2": "Ananya",
          "3": "Sunday, 15 Dec",
          "4": "The Leela Palace, Udaipur"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Joyfully Accept 💐",
            "value": "RSVP_ACCEPT"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Regretfully Decline",
            "value": "RSVP_DECLINE"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-tech-conference-schedule",
    "title": "Tech conference keynote schedule",
    "industry": "Events",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Speaker agenda and hall tracks PDF.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/conference-agenda.pdf"
        },
        "body": "Welcome to {{1}}! 🎤 Attached is the complete track schedule for Day {{2}}. Keynote by {{3}} begins at {{4}} in Grand Hall A.",
        "sampleValues": {
          "1": "India AI Summit 2026",
          "2": "1",
          "3": "Dr. Satya Nadella",
          "4": "9:30 AM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Interactive Agenda",
            "value": "https://summit.example.com/agenda"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-exhibition-visitor-badge",
    "title": "Exhibition visitor pass & barcode",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "B2B trade show badge and entry code.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your visitor badge for {{2}} is ready! Badge ID: {{3}}. Skip the queue and print your badge at Self-Check-in Kiosk 4.",
        "sampleValues": {
          "1": "Rajeev Verma",
          "2": "Auto Expo 2026",
          "3": "#BADGE-90812"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Show Entry Barcode",
            "value": "https://expo.example.com/badge"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-standup-comedy-tickets",
    "title": "Standup comedy show tickets",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Seat numbers, show time and gate instructions.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Get ready to laugh! 🎭 Tickets for {{1}} live show confirmed. Seats: {{2}}, Date: {{3}} at {{4}}. Venue: {{5}}.",
        "sampleValues": {
          "1": "Zakir Khan Live",
          "2": "Row E (12, 13)",
          "3": "Saturday",
          "4": "8:00 PM",
          "5": "NCPA Auditorium"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View E-Tickets",
            "value": "https://tickets.example.com/zakir"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-food-festival-entry",
    "title": "Food & music festival entry pass",
    "industry": "Events",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Weekend food carnival tickets & tasting coupon.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80"
        },
        "body": "Taste the best dishes in town! 🍔 50+ Gourmet Pop-ups, Live Music & Craft Beer at {{1}} on {{2}}. Early bird passes include {{3}} free tasting tokens.",
        "sampleValues": {
          "1": "The Great Food Fest",
          "2": "24-25 Nov",
          "3": "₹300"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Get Festival Passes",
            "value": "https://example.com/foodfest"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-venue-parking-guide",
    "title": "Venue directions & parking guide",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Navigation link and valet parking instructions.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Attending {{1}} today? Valet parking is available at Gate {{2}}. Tap below for live GPS directions to avoid traffic.",
        "sampleValues": {
          "1": "Global FinTech Conclave",
          "2": "3"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Navigate to Venue 📍",
            "value": "https://maps.google.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-early-bird-pass-closing",
    "title": "Ticket prices increasing tonight",
    "industry": "Events",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "FOMO urgency for concert or summit passes.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Phase 1 tickets for {{1}} are 92% SOLD OUT! ⏳ Prices go up by {{2}} at midnight. Grab yours now before prices hike.",
        "sampleValues": {
          "1": "EDM Arena 2026",
          "2": "₹1,000"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Book Before Price Rise",
            "value": "https://example.com/tickets"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-networking-dinner-reminder",
    "title": "VIP networking dinner reminder",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Founders & investors dinner reminder.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, looking forward to seeing you at the {{2}} tonight at {{3}}. Dress code: {{4}}. Table: {{5}}.",
        "sampleValues": {
          "1": "Kunal",
          "2": "Founders & VC Dinner",
          "3": "8:00 PM",
          "4": "Smart Casual",
          "5": "Table 7"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Guest List",
            "value": "https://example.com/guests"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-concert-gates-open",
    "title": "Concert gates open alert",
    "industry": "Events",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Live entry queue and stage timing update.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Gates are now OPEN for {{1}}! Opening act starts at {{2}}, and main headliner goes live at {{3}}. Please have your digital QR ticket ready.",
        "sampleValues": {
          "1": "Coldplay Mumbai 2026",
          "2": "5:30 PM",
          "3": "7:45 PM"
        }
      }
    ]
  },
  {
    "slug": "events-hackathon-shortlist",
    "title": "Hackathon team shortlist announcement",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Round 2 shortlist and mentor allocation.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Congratulations Team {{1}}! 🚀 Your project has been shortlisted for the 36-Hour National Grand Finale of {{2}}. Assigned Mentor: {{3}}.",
        "sampleValues": {
          "1": "CodeCraft",
          "2": "Smart India Hackathon",
          "3": "Vikramaditya (Senior Architect)"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Join Discord / Slack",
            "value": "https://discord.example.com"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-sports-match-pass",
    "title": "Cricket / football stadium match pass",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "IPL or ISL match tickets with bay/stand details.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Match Day! 🏏 {{1}} vs {{2}}. Your tickets for Stand: {{3}}, Bay: {{4}} are ready. Stadium gates open 3 hours prior to toss.",
        "sampleValues": {
          "1": "India",
          "2": "Australia",
          "3": "Garware Pavilion",
          "4": "Bay 12"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download Stadium Pass",
            "value": "https://example.com/matchpass"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-speaker-slides-recording",
    "title": "Session recording & presentation slides",
    "industry": "Events",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Post-conference resource access.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Thank you for attending {{1}}! 🎓 The slide decks and full 4K session recordings from all speaker tracks are now available in your portal.",
        "sampleValues": {
          "1": "Product Leaders Summit 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Access Recordings & Slides",
            "value": "https://example.com/resources"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-vip-backstage-pass",
    "title": "VIP backstage meet & greet voucher",
    "industry": "Events",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "Artist meet and greet upgrade.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=80"
        },
        "body": "Meet the artist in person! 🌟 Upgrade your pass to {{1}} Backstage VIP for exclusive photo-op, signed merchandise & lounge hospitality.",
        "sampleValues": {
          "1": "Arijit Singh Symphony Tour"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Upgrade to VIP",
            "value": "https://example.com/vip"
          }
        ]
      }
    ]
  },
  {
    "slug": "events-annual-gala-banquet",
    "title": "Annual corporate gala & awards night",
    "industry": "Events",
    "category": "MARKETING",
    "format": "BUTTONS_TEXT",
    "description": "Awards night invitation for partners and clients.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, you are cordially invited to our Annual Excellence Gala & Awards Night on {{2}} at {{3}}. Join us for an evening of celebration & fine dining.",
        "sampleValues": {
          "1": "Esteemed Partner",
          "2": "Friday, 20 Dec",
          "3": "Grand Hyatt"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Accept Invitation",
            "value": "ACCEPT_GALA"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Decline",
            "value": "DECLINE_GALA"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-home-appliance-repair-booked",
    "title": "Appliance repair service booked",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "AC, refrigerator or washing machine repair confirmation.",
    "order": 2,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your service request for {{2}} repair is booked for {{3}} between {{4}}. Service ID: {{5}}.",
        "sampleValues": {
          "1": "Harish",
          "2": "Split AC Deep Cleaning",
          "3": "Tomorrow",
          "4": "11:00 AM - 1:00 PM",
          "5": "#SRV-10293"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Reschedule",
            "value": "RESCHEDULE"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Cancel Booking",
            "value": "CANCEL"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-technician-on-the-way",
    "title": "Technician dispatched & on the way",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Real-time arrival notification with technician details.",
    "order": 3,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, our verified technician {{2}} (Ph: {{3}}) is on the way to your address for {{4}}. Expected arrival: {{5}} minutes.",
        "sampleValues": {
          "1": "Pooja",
          "2": "Suresh",
          "3": "+919876543210",
          "4": "Water Purifier Filter Change",
          "5": "20"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Technician",
            "phoneNumber": "+919876543210"
          },
          {
            "type": "URL",
            "text": "Live Tracking",
            "value": "https://track.example.com/tech"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-quotation-estimate-pdf",
    "title": "Service estimate & formal quotation",
    "industry": "Services",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Price breakdown document for client approval.",
    "order": 4,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/quotation.pdf"
        },
        "body": "Dear {{1}}, please find attached the detailed quotation for {{2}} (Ref: {{3}}). Total estimated amount: {{4}}. Valid for 14 days.",
        "sampleValues": {
          "1": "Sunil Mehta",
          "2": "Office Painting & Waterproofing",
          "3": "#EST-491",
          "4": "₹48,500"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Approve Quotation",
            "value": "APPROVE_QUOTE"
          },
          {
            "type": "QUICK_REPLY",
            "text": "Request Changes",
            "value": "EDIT_QUOTE"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-amc-renewal-reminder",
    "title": "Annual Maintenance Contract (AMC) renewal",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Appliance or IT hardware maintenance contract renewal.",
    "order": 5,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your Annual Maintenance Contract (AMC) for {{2}} expires on {{3}}. Renew today to ensure 3 free routine visits & zero labor charges.",
        "sampleValues": {
          "1": "Vivek",
          "2": "Daikin Inverter ACs (3 units)",
          "3": "15 Dec 2026"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Renew AMC Online",
            "value": "https://example.com/amc"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-pest-control-appointment",
    "title": "Pest control service schedule",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Termite / herbal pest treatment instructions.",
    "order": 6,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your pest control treatment is booked for {{2}} at {{3}}. Please ensure kitchen utensils are kept covered during the treatment.",
        "sampleValues": {
          "1": "Archana",
          "2": "Saturday",
          "3": "10:00 AM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Safety Instructions",
            "value": "https://example.com/safety"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-car-service-completed",
    "title": "Car service completed & ready for pickup",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Vehicle maintenance invoice and pickup alert.",
    "order": 7,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Good news {{1}}! Periodic service for your {{2}} (Reg: {{3}}) has been completed. Bill amount: {{4}}. Your car is cleaned and ready for pickup.",
        "sampleValues": {
          "1": "Raghav",
          "2": "Hyundai Creta",
          "3": "KA-01-MJ-5511",
          "4": "₹7,200"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Pay Bill & View Job Card",
            "value": "https://example.com/service"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-electrician-confirmed",
    "title": "Electrician visit confirmed",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Wiring, MCB or fixture repair slot.",
    "order": 8,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, an expert electrician has been scheduled for your request \"{{2}}\" on {{3}} at {{4}}. Visiting charges: {{5}} (adjusted in final bill).",
        "sampleValues": {
          "1": "Deepak",
          "2": "Ceiling Fan & Switchboard Repair",
          "3": "Today",
          "4": "3:30 PM",
          "5": "₹199"
        },
        "buttons": [
          {
            "type": "QUICK_REPLY",
            "text": "Confirm Slot",
            "value": "CONFIRM"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-cleaning-sanitization-booked",
    "title": "Deep house cleaning booked",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Full home or kitchen deep cleaning slot.",
    "order": 9,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your {{2}} service is scheduled for {{3}} at {{4}}. A team of {{5}} trained cleaning specialists will arrive with equipment.",
        "sampleValues": {
          "1": "Shruti",
          "2": "3BHK Deep Home Cleaning",
          "3": "Sunday",
          "4": "9:00 AM",
          "5": "3"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View Service Checklist",
            "value": "https://example.com/cleaning"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-warranty-card-digital",
    "title": "Service completion & warranty card",
    "industry": "Services",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "Proof of repair with 90-day parts warranty.",
    "order": 10,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/warranty-card.pdf"
        },
        "body": "Thank you for choosing us {{1}}! Attached is your service completion certificate and {{2}}-day warranty card for {{3}}.",
        "sampleValues": {
          "1": "Manish",
          "2": "90",
          "3": "Compressor Motor Replacement"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Rate Our Service",
            "value": "https://example.com/rate"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-gst-filing-reminder",
    "title": "GST & tax return filing deadline",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Chartered accountant tax reminder for businesses.",
    "order": 11,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Dear {{1}}, deadline for filing {{2}} for the month of {{3}} is {{4}}. Please upload your sales invoices and purchase bills to avoid late fees.",
        "sampleValues": {
          "1": "Business Owner",
          "2": "GSTR-3B",
          "3": "October",
          "4": "20 Nov"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Upload Invoices",
            "value": "https://ca.example.com/upload"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-marketing-monthly-report",
    "title": "Digital marketing monthly report",
    "industry": "Services",
    "category": "UTILITY",
    "format": "MEDIA_BUTTONS",
    "description": "SEO, Google Ads, and social media monthly analytics PDF.",
    "order": 12,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "DOCUMENT",
          "mediaUrl": "https://example.com/monthly-analytics.pdf"
        },
        "body": "Hi {{1}}, your digital marketing performance report for {{2}} is ready! Generated {{3}} qualified leads with a ROAS of {{4}}x.",
        "sampleValues": {
          "1": "Client",
          "2": "October",
          "3": "418",
          "4": "4.8"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Schedule Strategy Call",
            "value": "https://calendly.com/agency"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-it-ticket-resolved",
    "title": "IT support ticket resolved",
    "industry": "Services",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Closure update on laptop or network issue.",
    "order": 13,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your IT support ticket ({{2}} - \"{{3}}\") has been resolved by our helpdesk engineer. If you still need help, reply REOPEN.",
        "sampleValues": {
          "1": "Employee",
          "2": "#IT-8812",
          "3": "VPN Configuration Issue"
        }
      }
    ]
  },
  {
    "slug": "services-plumbing-emergency-dispatched",
    "title": "Plumbing emergency technician dispatched",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Urgent leak or pipe blockage assistance.",
    "order": 14,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Emergency Plumbing Request Confirmed! Plumber {{1}} is en route to {{2}}. Please turn off the main water valve if feasible.",
        "sampleValues": {
          "1": "Santosh (+919876543210)",
          "2": "Flat 402"
        },
        "buttons": [
          {
            "type": "PHONE_NUMBER",
            "text": "Call Plumber",
            "phoneNumber": "+919876543210"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-courier-pickup-scheduled",
    "title": "Courier pickup scheduled",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Domestic & international parcel pickup time window.",
    "order": 15,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your parcel pickup (AWB: {{2}}) is scheduled for today between {{3}}. Please keep the package sealed with the shipping label pasted.",
        "sampleValues": {
          "1": "Shipper",
          "2": "DEL-9921448",
          "3": "2:00 PM - 5:00 PM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Download Shipping Label",
            "value": "https://courier.example.com/label"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-laundry-pickup-reminder",
    "title": "Laundry & dry cleaning pickup reminder",
    "industry": "Services",
    "category": "UTILITY",
    "format": "TEXT",
    "description": "Doorstep pickup reminder for clothes.",
    "order": 16,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, our laundry van will arrive at your location today around {{2}} for dry cleaning pickup. Have your clothes bag ready!",
        "sampleValues": {
          "1": "Customer",
          "2": "11:30 AM"
        }
      }
    ]
  },
  {
    "slug": "services-interior-design-3d-draft",
    "title": "Interior design 3D layout draft ready",
    "industry": "Services",
    "category": "MARKETING",
    "format": "MEDIA_BUTTONS",
    "description": "3D renders and floor walkthrough ready.",
    "order": 17,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "header": {
          "format": "IMAGE",
          "mediaUrl": "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80"
        },
        "body": "Hi {{1}}, exciting news! Your 3D modular kitchen and living room design concepts are ready for review. Tap below to view high-res renders.",
        "sampleValues": {
          "1": "Rohan"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "View 3D Renders 🛋️",
            "value": "https://example.com/design"
          }
        ]
      }
    ]
  },
  {
    "slug": "services-solar-site-survey",
    "title": "Solar rooftop installation site survey",
    "industry": "Services",
    "category": "UTILITY",
    "format": "BUTTONS_TEXT",
    "description": "Free technical solar feasibility check booking.",
    "order": 18,
    "localizations": [
      {
        "language": "en",
        "languageLabel": "English",
        "body": "Hi {{1}}, your free Solar Rooftop Feasibility Survey is booked for {{2}} at {{3}}. Our solar engineer will assess shadow-free roof area & electricity bill savings.",
        "sampleValues": {
          "1": "Homeowner",
          "2": "Thursday",
          "3": "11:00 AM"
        },
        "buttons": [
          {
            "type": "URL",
            "text": "Solar Savings Calculator",
            "value": "https://solar.example.com/calculator"
          }
        ]
      }
    ]
  }
];

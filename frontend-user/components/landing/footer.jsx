import Link from 'next/link';
import { StockExLogo } from '@/components/StockExLogo'
import { Facebook, Twitter, Linkedin, Instagram, Youtube } from "lucide-react"


export function Footer() {
  return (
    <footer className="bg-deep-blue text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <Link href="/" className="flex items-center mb-6">
            <StockExLogo className="h-12 w-auto" alt="StockEx" />
          </Link>
          <p className="text-sm text-white/60 mb-6">
            Trade India's Financial Markets
          </p>
          {/* Social Links */}
          <div className="flex gap-3">
            {[Facebook, Twitter, Linkedin, Instagram, Youtube].map((Icon, index) => (
              <Link
                key={index}
                href="#"
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-yellow-accent hover:text-deep-blue transition-colors"
              >
                <Icon className="w-5 h-5" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Warning */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white/5 rounded-xl p-6">
            <h5 className="font-semibold text-sm mb-2 text-yellow-accent">Risk Warning</h5>
            <p className="text-xs text-white/60 leading-relaxed">
              Trading in financial markets involves substantial risk of loss and is not suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade, you should carefully consider your investment objectives, level of experience, and risk appetite. You should be aware of all the risks associated with trading and seek advice from an independent financial advisor if you have any doubts.
            </p>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-xs text-white/40 text-center">
            � {new Date().getFullYear()} STOCKEX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

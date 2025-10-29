import "flag-icons/css/flag-icons.min.css";

interface FlagIconProps {
  countryCode: string;
  marketName?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "w-4 h-3",
  md: "w-5 h-4",
  lg: "w-6 h-5",
  xl: "w-8 h-6",
};

const countryNames: Record<string, string> = {
  "us": "Estados Unidos",
  "es": "España",
  "es-ct": "España (Catalunya)",
  "de": "Alemania",
  "fr": "Francia",
  "it": "Italia",
  "gb": "Reino Unido",
  "br": "Brasil",
};

export function FlagIcon({ countryCode, marketName, className = "", size = "md" }: FlagIconProps) {
  const code = countryCode.toLowerCase();
  
  const specialCases: Record<string, string> = {
    "es-ct": "es",
  };
  
  const finalCode = specialCases[code] || code;
  const ariaLabel = marketName || countryNames[code] || countryCode;
  
  return (
    <span
      className={`fi fi-${finalCode} inline-block ${sizeClasses[size]} ${className}`}
      role="img"
      aria-label={`Bandera de ${ariaLabel}`}
      title={ariaLabel}
      style={{ 
        borderRadius: "2px",
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}

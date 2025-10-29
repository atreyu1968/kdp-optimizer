import "flag-icons/css/flag-icons.min.css";

interface FlagIconProps {
  countryCode: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "w-4 h-3",
  md: "w-5 h-4",
  lg: "w-6 h-5",
  xl: "w-8 h-6",
};

export function FlagIcon({ countryCode, className = "", size = "md" }: FlagIconProps) {
  const code = countryCode.toLowerCase();
  
  const specialCases: Record<string, string> = {
    "es-ct": "es",
  };
  
  const finalCode = specialCases[code] || code;
  
  return (
    <span
      className={`fi fi-${finalCode} inline-block ${sizeClasses[size]} ${className}`}
      role="img"
      aria-label={`Bandera de ${countryCode}`}
      style={{ 
        borderRadius: "2px",
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}

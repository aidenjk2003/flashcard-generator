export function Input({ className = "", ...props }) {
    return (
      <input 
        className={`border px-20 py-1 rounded ${className}`}
        {...props}
      />
    );
  }
  
import { useId } from 'react';
import PhoneInput, { type Country as PhoneCountryCode } from 'react-phone-number-input';
import type { Strings } from '../../assets/i18n/types';
import { usePhoneInputLabels } from '../../hooks/usePhoneInputLabels';
import { FIELD_PHONE_MAX } from '../../utils/fieldLimits';
import { RequiredMark } from '../ui/RequiredMark';
import authFormStyles from '../auth/AuthForm.module.css';
import styles from './AddressFormModal.module.css';

interface AddressPhoneFieldProps {
  strings: Strings['address'];
  countryCode: string;
  countries: PhoneCountryCode[] | undefined;
  countryLocked: boolean;
  required: boolean;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

/** Country-locked phone presentation used by both home and relay-point forms.
 * The parent remains responsible for cross-field country validation.
 * The label targets the number input by id: wrapping PhoneInput in a <label>
 * labelled its first control, the country <select>, and left the number
 * itself without a name (RGAA 11.1). */
export function AddressPhoneField({
  strings,
  countryCode,
  countries,
  countryLocked,
  required,
  value,
  error,
  onChange,
}: AddressPhoneFieldProps) {
  const phoneLabels = usePhoneInputLabels();
  const inputId = useId();
  return (
    <div className={`${authFormStyles.field} ${styles.field}`}>
      <label className={authFormStyles.label} htmlFor={inputId}>
        {strings.phoneField}
        {required && <RequiredMark />}
      </label>
      <PhoneInput
        key={countryCode}
        id={inputId}
        {...(authFormStyles.phoneInput ? { className: authFormStyles.phoneInput } : {})}
        name="tel"
        data-field="phone"
        data-testid="address-phone"
        autoComplete="tel"
        maxLength={FIELD_PHONE_MAX}
        value={value}
        labels={phoneLabels}
        {...(countries ? { countries } : {})}
        countrySelectProps={{ disabled: countryLocked }}
        addInternationalOption={false}
        {...(countryCode ? { defaultCountry: countryCode as PhoneCountryCode } : {})}
        international={false}
        aria-required={required || undefined}
        aria-invalid={error != null}
        aria-describedby={error ? 'address-phone-error' : 'address-phone-hint'}
        onChange={(nextValue) => onChange(nextValue ?? '')}
      />
      {error ? (
        <p id="address-phone-error" className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : (
        <p id="address-phone-hint" className={authFormStyles.hint}>
          {strings.phoneHint}
        </p>
      )}
    </div>
  );
}

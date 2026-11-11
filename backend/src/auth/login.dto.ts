import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Укажите корректный email' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Укажите пароль' })
  @MaxLength(200)
  password: string;
}

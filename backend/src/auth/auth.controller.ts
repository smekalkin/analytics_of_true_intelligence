import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { LoginDto } from './login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}

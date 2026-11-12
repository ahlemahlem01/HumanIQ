import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, RegisterDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

// Strict limits per IP against password guessing and e-mail flooding (only enforced in production).
const LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const MAIL_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService) {}

  @Throttle(MAIL_LIMIT)
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle(LOGIN_LIMIT)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Throttle(LOGIN_LIMIT)
  @Post("verify-email")
  verify(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Throttle(MAIL_LIMIT)
  @Post("resend-verification")
  resend(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Throttle(MAIL_LIMIT)
  @Post("forgot-password")
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Throttle(LOGIN_LIMIT)
  @Post("reset-password")
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: Parameters<AuthService["serialize"]>[0] }) {
    return this.auth.serialize(req.user);
  }
}

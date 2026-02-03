import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserUpdateResponseDto } from './dto/user-update-response.dto';

@ApiTags('Users')
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('update')
  @ApiOperation({
    summary: 'Solicita atualização de partidas do usuário',
    description:
      'Recebe um Riot ID (gameName + tagLine), resolve o PUUID via Account-V1 API, ' +
      'busca as últimas 20 partidas e enfileira apenas as novas para processamento.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Solicitação processada com sucesso.',
    type: UserUpdateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 404, description: 'Conta não encontrada.' })
  async updateUser(
    @Body() dto: UpdateUserDto,
  ): Promise<UserUpdateResponseDto> {
    return this.usersService.updateUser(dto);
  }

  @Get(':puuid/matches')
  @ApiOperation({
    summary: 'Busca partidas de um usuário pelo PUUID',
    description: 'Retorna as partidas processadas de um usuário.',
  })
  @ApiParam({ name: 'puuid', description: 'PUUID do jogador' })
  async getUserMatches(@Param('puuid') puuid: string) {
    // TODO: Implementar busca de partidas do usuário
    return { message: 'Endpoint ainda não implementado', puuid };
  }
}
